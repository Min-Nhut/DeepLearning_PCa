import contextlib
import csv
import io
import json
import sqlite3
import tempfile
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..ai_models_config import list_model_infos
from ..audit import write_audit_log
from ..database import get_db
from ..deps import require_admin
from ..models import AuditLog, Case, DiagnosticReview, Image, InferenceRun, Slide, User
from ..schemas import (
    AdminStats,
    LogOut,
    MigrationImportResult,
    MigrationPreview,
    ModelInfo,
    SqliteCasePreview,
    SqliteMigrationImportResult,
    SqliteMigrationPreview,
    UserCreate,
    UserOut,
    UserUpdate,
)
from ..security import hash_password
from .cases import MAX_IMAGES_PER_SLIDE, MAX_SLIDES_PER_CASE, UPLOAD_ROOT, _process_and_store, _read_capped

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---------------------------------------------------------------- stats ----
@router.get("/stats", response_model=AdminStats)
def get_stats(db: Session = Depends(get_db)) -> AdminStats:
    total_cases = db.query(func.count(Case.id)).scalar() or 0
    active_users = db.query(func.count(User.id)).filter(User.is_active == 1).scalar() or 0

    runs = db.query(InferenceRun).all()
    completed = [r for r in runs if r.status == "completed" and r.started_at and r.completed_at]
    durations = []
    for r in completed:
        try:
            started = datetime.fromisoformat(r.started_at)
            finished = datetime.fromisoformat(r.completed_at)
            durations.append((finished - started).total_seconds())
        except ValueError:
            continue
    avg_processing_seconds = sum(durations) / len(durations) if durations else None

    total_runs = len(runs)
    failed_runs = sum(1 for r in runs if r.status == "failed")
    pipeline_error_rate = (failed_runs / total_runs) if total_runs else None

    return AdminStats(
        total_cases=total_cases,
        active_users=active_users,
        avg_processing_seconds=avg_processing_seconds,
        pipeline_error_rate=pipeline_error_rate,
    )


# ---------------------------------------------------------------- users ----
@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[UserOut]:
    users = db.query(User).order_by(User.created_at.desc()).all()

    # 2 grouped aggregate queries instead of 2 queries *per user* (was a real
    # N+1 — harmless at this app's current ~4 accounts, but wasteful at scale).
    run_counts = dict(
        db.query(InferenceRun.triggered_by, func.count(InferenceRun.id))
        .group_by(InferenceRun.triggered_by)
        .all()
    )
    last_activities = dict(
        db.query(AuditLog.user_id, func.max(AuditLog.created_at))
        .group_by(AuditLog.user_id)
        .all()
    )

    return [
        UserOut(
            id=u.id,
            username=u.username,
            full_name=u.full_name,
            role=u.role,
            is_active=bool(u.is_active),
            run_count=run_counts.get(u.id, 0),
            last_activity=last_activities.get(u.id),
        )
        for u in users
    ]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserOut:
    if payload.role not in ("user", "admin"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "role phải là 'user' hoặc 'admin'")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Username đã tồn tại")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=1,
    )
    db.add(user)
    db.flush()
    write_audit_log(db, admin, "create_user", "user", user.id, details=f"username={user.username}, role={user.role}")
    db.commit()
    db.refresh(user)
    return UserOut(
        id=user.id, username=user.username, full_name=user.full_name, role=user.role,
        is_active=bool(user.is_active), run_count=0, last_activity=None,
    )


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy người dùng")

    changed_fields = list(payload.model_dump(exclude_unset=True).keys())
    if payload.role is not None:
        if payload.role not in ("user", "admin"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "role phải là 'user' hoặc 'admin'")
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = 1 if payload.is_active else 0
    if payload.full_name is not None:
        user.full_name = payload.full_name

    write_audit_log(db, admin, "update_user", "user", user.id, details=",".join(changed_fields) or None)
    db.commit()
    db.refresh(user)
    run_count = db.query(func.count(InferenceRun.id)).filter(InferenceRun.triggered_by == user.id).scalar() or 0
    last_activity = db.query(func.max(AuditLog.created_at)).filter(AuditLog.user_id == user.id).scalar()
    return UserOut(
        id=user.id, username=user.username, full_name=user.full_name, role=user.role,
        is_active=bool(user.is_active), run_count=run_count, last_activity=last_activity,
    )


# ----------------------------------------------------------------- logs ----
@router.get("/logs", response_model=list[LogOut])
def list_logs(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[LogOut]:
    rows = (
        db.query(AuditLog, User.username)
        .outerjoin(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        LogOut(
            id=log.id, created_at=log.created_at, username=username, action=log.action,
            entity_type=log.entity_type, entity_id=log.entity_id, details=log.details,
        )
        for log, username in rows
    ]


# ---------------------------------------------------------------- models ----
@router.get("/models", response_model=list[ModelInfo])
def list_models() -> list[ModelInfo]:
    return list_model_infos()


# --------------------------------------------------------------- library ----
_LIBRARY_EXPORT_FIELDS = [
    "case_id", "case_code", "case_year", "patient_age", "conclusion",
    "is_anonymized", "source", "created_at",
    "slide_id", "slide_label", "image_id", "image_number", "magnification", "description",
    "primary_pattern", "secondary_pattern", "review_status",
]


@router.get("/library/export")
def export_library(
    db: Session = Depends(get_db),
    format: str = Query("csv", pattern="^(csv|json)$"),
    scope: str = Query("all", pattern="^(all|reviewed)$"),
) -> StreamingResponse:
    """One row per image, matching the flat shape of the legacy desktop app's own
    export (Debug/Export_*.xlsx: Ma So/Ma Nam/Ket Luan/Ten Slide/Do Phong Dai/Gleason)
    instead of one row per case — plus the real structured Gleason pattern from
    diagnostic_reviews where one exists, which the legacy export never had (it only
    had a free-text description). A case with no slides/images yet still gets exactly
    one row (slide/image fields blank) under scope=all so it isn't silently dropped."""
    # Latest diagnostic review per image — same get-or-create-latest convention as
    # reviews.py (diagnostic_reviews has no UNIQUE(image_id) constraint).
    review_by_image: dict[int, DiagnosticReview] = {}
    for r in db.query(DiagnosticReview).order_by(DiagnosticReview.created_at, DiagnosticReview.id):
        review_by_image[r.image_id] = r

    cases = db.query(Case).order_by(Case.id).all()

    rows: list[dict] = []
    for c in cases:
        case_fields = {
            "case_id": c.id,
            "case_code": c.case_code,
            "case_year": c.case_year,
            # patient_name intentionally omitted — library exports must stay anonymized (PRD §9.3)
            "patient_age": c.patient_age,
            "conclusion": c.conclusion,
            "is_anonymized": bool(c.is_anonymized),
            "source": c.source,
            "created_at": c.created_at,
        }
        slide_images = [
            (slide, image)
            for slide in sorted(c.slides, key=lambda s: s.slide_number)
            for image in sorted(slide.images, key=lambda im: im.image_number)
        ]
        if not slide_images:
            if scope == "reviewed":
                continue  # nothing confirmed for a case with no images at all
            rows.append({
                **case_fields,
                "slide_id": None, "slide_label": None, "image_id": None, "image_number": None,
                "magnification": None, "description": None,
                "primary_pattern": None, "secondary_pattern": None, "review_status": None,
            })
            continue
        for slide, image in slide_images:
            review = review_by_image.get(image.id)
            if scope == "reviewed" and (review is None or review.status != "confirmed"):
                continue
            rows.append({
                **case_fields,
                "slide_id": slide.id,
                "slide_label": slide.legacy_slide_label or f"Slide {slide.slide_number}",
                "image_id": image.id,
                "image_number": image.image_number,
                "magnification": image.magnification,
                "description": image.description,
                "primary_pattern": review.primary_pattern if review else None,
                "secondary_pattern": review.secondary_pattern if review else None,
                "review_status": review.status if review else None,
            })

    if format == "json":
        buf = io.StringIO(json.dumps(rows, ensure_ascii=False, indent=2))
        media_type = "application/json"
        filename = "prostaai_library_export.json"
    else:
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=_LIBRARY_EXPORT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
        media_type = "text/csv"
        filename = "prostaai_library_export.csv"

    buf.seek(0)
    return StreamingResponse(
        buf, media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# -------------------------------------------------------------- migration ----
_HEADER_ALIASES: dict[str, list[str]] = {
    "case_code": ["ma so", "case_code", "ma_so"],
    "case_year": ["ma nam", "case_year", "ma_nam"],
    "patient_name": ["ho ten", "ho ten benh nhan", "patient_name"],
    "patient_age": ["tuoi", "patient_age"],
    "conclusion": ["ket luan", "conclusion"],
}


def _normalize_header(header: str) -> str:
    decomposed = unicodedata.normalize("NFKD", header)
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    return ascii_only.strip().lower()


def _build_field_mapping(columns: list[str]) -> dict[str, str]:
    normalized = {col: _normalize_header(col) for col in columns}
    mapping: dict[str, str] = {}
    for schema_field, aliases in _HEADER_ALIASES.items():
        for col, norm in normalized.items():
            if norm in aliases:
                mapping[col] = schema_field
                break
    return mapping


async def _read_csv(file: UploadFile) -> tuple[list[str], list[dict]]:
    raw = await file.read()
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    return reader.fieldnames or [], rows


@router.post("/migration/preview", response_model=MigrationPreview)
async def migration_preview(file: UploadFile) -> MigrationPreview:
    columns, rows = await _read_csv(file)
    mapping = _build_field_mapping(columns)
    unmapped = [c for c in columns if c not in mapping]
    return MigrationPreview(
        columns=columns, row_count=len(rows), field_mapping=mapping, unmapped_columns=unmapped,
    )


@router.post("/migration/import", response_model=MigrationImportResult)
async def migration_import(
    file: UploadFile,
    anonymize: bool = True,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> MigrationImportResult:
    columns, rows = await _read_csv(file)
    mapping = _build_field_mapping(columns)
    reverse_mapping = {v: k for k, v in mapping.items()}  # schema_field -> original column

    if "case_code" not in reverse_mapping:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Không tìm thấy cột 'Mã số' (case_code) trong file — không thể nhập dữ liệu.",
        )

    imported = 0
    skipped = 0
    skipped_reasons: list[str] = []

    for i, row in enumerate(rows, start=2):  # row 1 is the header
        case_code = (row.get(reverse_mapping["case_code"]) or "").strip()
        if not case_code:
            skipped += 1
            skipped_reasons.append(f"Dòng {i}: thiếu Mã số")
            continue

        case_year = row.get(reverse_mapping.get("case_year", ""), None)
        raw_age = row.get(reverse_mapping.get("patient_age", ""), None)
        try:
            patient_age = int(raw_age) if raw_age else None
        except ValueError:
            patient_age = None
        conclusion = row.get(reverse_mapping.get("conclusion", ""), None)
        raw_name = row.get(reverse_mapping.get("patient_name", ""), None)

        case = Case(
            case_code=case_code,
            case_year=case_year or None,
            patient_name=None if anonymize else (raw_name or None),
            patient_age=patient_age,
            conclusion=conclusion or None,
            is_anonymized=1 if anonymize else 0,
            source="legacy_import",
            legacy_case_id=case_code,
            created_by=admin.id,
        )
        # A nested SAVEPOINT so a duplicate case_code+case_year only rolls back
        # this one row — a plain db.rollback() here would wipe out every case
        # already flushed earlier in this same import request.
        try:
            with db.begin_nested():
                db.add(case)
                db.flush()
        except IntegrityError:
            skipped += 1
            skipped_reasons.append(f"Dòng {i}: mã ca '{case_code}' đã tồn tại (trùng case_code+case_year)")
            continue

        db.add(Slide(case_id=case.id, slide_number=1))
        imported += 1

    db.add(
        AuditLog(
            user_id=admin.id,
            action="migrate_data",
            entity_type="case",
            entity_id=None,
            details=f"Imported {imported} case(s) from legacy CSV, skipped {skipped}",
        )
    )
    db.commit()

    return MigrationImportResult(imported=imported, skipped=skipped, skipped_reasons=skipped_reasons)


# ---------------------------------------- migration — legacy SQLite connector ----
_LEGACY_TABLES = {"CaBenh", "Slide", "SlideDoPhongDai", "HinhAnh"}


@contextlib.contextmanager
def _open_legacy_sqlite(raw: bytes):
    """The real desktop app ("ImageCapture", D:\\LV\\Debug — WinForms + EF6) stores its
    data as plain SQLite. sqlite3 needs a real file path (not in-memory bytes), so the
    upload is written to a temp file, opened read-only, and always cleaned up here —
    both on success and on the "wrong file" rejection below."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp.write(raw)
        tmp_path = Path(tmp.name)
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(f"file:{tmp_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        try:
            tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        except sqlite3.DatabaseError:
            # Not a SQLite file at all (a spreadsheet, a corrupt copy). Without
            # this the admin gets a 500 and no idea what went wrong — the
            # missing-tables branch below only fires once the file opens.
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "File tải lên không phải database SQLite hợp lệ.",
            )
        if not _LEGACY_TABLES.issubset(tables):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "File không đúng định dạng database ImageCapture "
                "(thiếu bảng CaBenh/Slide/SlideDoPhongDai/HinhAnh).",
            )
        yield conn
    finally:
        if conn is not None:
            conn.close()
        tmp_path.unlink(missing_ok=True)


@router.post("/migration/sqlite-preview", response_model=SqliteMigrationPreview)
async def migration_sqlite_preview(db_file: UploadFile) -> SqliteMigrationPreview:
    raw = await db_file.read()
    with _open_legacy_sqlite(raw) as legacy:
        case_count = legacy.execute("SELECT COUNT(*) FROM CaBenh").fetchone()[0]
        slide_count = legacy.execute("SELECT COUNT(*) FROM Slide").fetchone()[0]
        image_count = legacy.execute("SELECT COUNT(*) FROM HinhAnh").fetchone()[0]
        magnifications = [
            r[0] for r in legacy.execute("SELECT DISTINCT DoPhongDai FROM SlideDoPhongDai ORDER BY DoPhongDai")
        ]
        cases: list[SqliteCasePreview] = []
        for row in legacy.execute("SELECT Id, MaSo, MaNam, HoTen FROM CaBenh ORDER BY Id"):
            sc = legacy.execute("SELECT COUNT(*) FROM Slide WHERE CaBenhId = ?", (row["Id"],)).fetchone()[0]
            ic = legacy.execute(
                "SELECT COUNT(*) FROM HinhAnh h "
                "JOIN SlideDoPhongDai sd ON h.SlideDoPhongDaiId = sd.Id "
                "JOIN Slide s ON sd.SlideId = s.Id WHERE s.CaBenhId = ?",
                (row["Id"],),
            ).fetchone()[0]
            cases.append(SqliteCasePreview(
                case_code=row["MaSo"], case_year=row["MaNam"], patient_name=row["HoTen"],
                slide_count=sc, image_count=ic,
            ))
    return SqliteMigrationPreview(
        case_count=case_count, slide_count=slide_count, image_count=image_count,
        magnifications_found=magnifications, cases=cases,
    )


@router.post("/migration/sqlite-import", response_model=SqliteMigrationImportResult)
async def migration_sqlite_import(
    db_file: UploadFile,
    image_files: list[UploadFile] = File(default_factory=list),
    anonymize: bool = Form(True),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SqliteMigrationImportResult:
    raw = await db_file.read()
    # Match legacy HinhAnh.DuongDan is an absolute path from the *original* machine and
    # is never valid here — the actual bytes have to be re-uploaded alongside the .db,
    # matched back to their HinhAnh row by filename (TenFile) instead.
    file_bytes_by_name: dict[str | None, bytes] = {}
    for f in image_files:
        file_bytes_by_name[f.filename] = await _read_capped(f)

    cases_imported = 0
    cases_skipped = 0
    slides_imported = 0
    images_imported = 0
    images_skipped = 0
    skipped_reasons: list[str] = []

    with _open_legacy_sqlite(raw) as legacy:
        for case_row in legacy.execute("SELECT * FROM CaBenh ORDER BY Id"):
            case = Case(
                case_code=case_row["MaSo"],
                case_year=case_row["MaNam"],
                patient_name=None if anonymize else case_row["HoTen"],
                patient_age=case_row["Tuoi"],
                conclusion=case_row["KetLuan"],
                is_anonymized=1 if anonymize else 0,
                source="legacy_import",
                legacy_case_id=str(case_row["Id"]),
                created_by=admin.id,
            )
            # Same nested-SAVEPOINT isolation as the CSV importer above — one duplicate
            # case_code+case_year must not roll back cases already imported this batch.
            try:
                with db.begin_nested():
                    db.add(case)
                    db.flush()
            except IntegrityError:
                cases_skipped += 1
                skipped_reasons.append(f"Ca '{case_row['MaSo']}': mã ca đã tồn tại (trùng case_code+case_year)")
                continue
            cases_imported += 1

            slide_rows = legacy.execute(
                "SELECT * FROM Slide WHERE CaBenhId = ? ORDER BY Id", (case_row["Id"],)
            ).fetchall()
            if len(slide_rows) > MAX_SLIDES_PER_CASE:
                skipped_reasons.append(
                    f"Ca '{case_row['MaSo']}': vượt quá {MAX_SLIDES_PER_CASE} slide/ca, "
                    f"bỏ qua {len(slide_rows) - MAX_SLIDES_PER_CASE} slide cuối"
                )
            for slide_number, slide_row in enumerate(slide_rows[:MAX_SLIDES_PER_CASE], start=1):
                slide = Slide(case_id=case.id, slide_number=slide_number, legacy_slide_label=slide_row["TenSlide"])
                db.add(slide)
                db.flush()
                slides_imported += 1

                image_rows = legacy.execute(
                    "SELECT h.*, sd.DoPhongDai AS DoPhongDai FROM HinhAnh h "
                    "JOIN SlideDoPhongDai sd ON h.SlideDoPhongDaiId = sd.Id "
                    "WHERE sd.SlideId = ? ORDER BY h.Id",
                    (slide_row["Id"],),
                ).fetchall()
                image_number = 0
                for image_row in image_rows[:MAX_IMAGES_PER_SLIDE]:
                    file_bytes = file_bytes_by_name.get(image_row["TenFile"])
                    if file_bytes is None:
                        images_skipped += 1
                        skipped_reasons.append(
                            f"Ca '{case_row['MaSo']}' / slide '{slide.legacy_slide_label}': "
                            f"không tìm thấy file '{image_row['TenFile']}' trong các file ảnh đã tải lên"
                        )
                        continue
                    dest_dir = UPLOAD_ROOT / f"case_{case.id}" / f"slide_{slide.id}"
                    stem = uuid.uuid4().hex
                    try:
                        ext, width, height = await run_in_threadpool(_process_and_store, file_bytes, dest_dir, stem)
                    except ValueError:
                        images_skipped += 1
                        skipped_reasons.append(f"File '{image_row['TenFile']}': không phải ảnh hợp lệ")
                        continue
                    magnification = (image_row["DoPhongDai"] or "").lower() or None
                    if magnification not in ("4x", "10x", "20x", "40x"):
                        magnification = None
                    image_number += 1
                    image = Image(
                        slide_id=slide.id,
                        image_number=image_number,
                        file_path=str((dest_dir / f"{stem}.{ext}").relative_to(UPLOAD_ROOT.parent)),
                        description=image_row["MoTa"],
                        width_px=width,
                        height_px=height,
                        format=ext,
                        uploaded_by=admin.id,
                        source="legacy_import",
                        legacy_image_id=str(image_row["Id"]),
                        magnification=magnification,
                    )
                    db.add(image)
                    db.flush()
                    images_imported += 1
                if len(image_rows) > MAX_IMAGES_PER_SLIDE:
                    skipped_reasons.append(
                        f"Slide '{slide.legacy_slide_label}': vượt quá {MAX_IMAGES_PER_SLIDE} ảnh/slide, "
                        f"bỏ qua {len(image_rows) - MAX_IMAGES_PER_SLIDE} ảnh cuối"
                    )

    write_audit_log(
        db, admin, "migrate_data", "case", None,
        details=(
            f"Imported {cases_imported} case(s) from legacy ImageCapture SQLite "
            f"({slides_imported} slides, {images_imported} images), "
            f"skipped {cases_skipped} case(s) / {images_skipped} image(s)"
        ),
    )
    db.commit()

    return SqliteMigrationImportResult(
        cases_imported=cases_imported, cases_skipped=cases_skipped, slides_imported=slides_imported,
        images_imported=images_imported, images_skipped=images_skipped, skipped_reasons=skipped_reasons,
    )
