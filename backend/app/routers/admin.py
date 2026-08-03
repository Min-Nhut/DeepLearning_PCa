import csv
import io
import json
import unicodedata
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..ai_models_config import MODELS
from ..audit import write_audit_log
from ..database import get_db
from ..deps import require_admin
from ..inference import registry as model_registry
from ..models import AuditLog, Case, DiagnosticReview, Image, InferenceRun, Slide, User
from ..schemas import (
    AdminStats,
    LogOut,
    MigrationImportResult,
    MigrationPreview,
    ModelInfo,
    UserCreate,
    UserOut,
    UserUpdate,
)
from ..security import hash_password

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
    out = []
    for u in users:
        run_count = db.query(func.count(InferenceRun.id)).filter(InferenceRun.triggered_by == u.id).scalar() or 0
        last_activity = (
            db.query(func.max(AuditLog.created_at)).filter(AuditLog.user_id == u.id).scalar()
        )
        out.append(
            UserOut(
                id=u.id,
                username=u.username,
                full_name=u.full_name,
                role=u.role,
                is_active=bool(u.is_active),
                run_count=run_count,
                last_activity=last_activity,
            )
        )
    return out


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
# Maps the 2 static (still-stale, see CLAUDE.md) generic entries to their real
# per-architecture task key, so `checkpoint_available` reflects whether *any*
# of the 4 real architectures for that task has a checkpoint on disk — the
# static list doesn't yet track individual architectures, only the task.
_MODEL_NAME_TO_TASK = {"Gland Segmentation": "segmentation", "Gleason Classification": "classification"}


@router.get("/models", response_model=list[ModelInfo])
def list_models() -> list[ModelInfo]:
    out = []
    for m in MODELS:
        task = _MODEL_NAME_TO_TASK.get(m.name)
        available = bool(model_registry.list_available(task)) if task else False
        out.append(m.model_copy(update={"checkpoint_available": available}))
    return out


# --------------------------------------------------------------- library ----
@router.get("/library/export")
def export_library(
    db: Session = Depends(get_db),
    format: str = Query("csv", pattern="^(csv|json)$"),
    scope: str = Query("all", pattern="^(all|reviewed)$"),
) -> StreamingResponse:
    query = db.query(Case)
    if scope == "reviewed":
        query = (
            query.join(Slide, Slide.case_id == Case.id)
            .join(Image, Image.slide_id == Slide.id)
            .join(DiagnosticReview, DiagnosticReview.image_id == Image.id)
            .filter(DiagnosticReview.status == "confirmed")
            .distinct()
        )
    cases = query.all()

    rows = [
        {
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
        for c in cases
    ]

    if format == "json":
        buf = io.StringIO(json.dumps(rows, ensure_ascii=False, indent=2))
        media_type = "application/json"
        filename = "prostaai_library_export.json"
    else:
        buf = io.StringIO()
        fieldnames = list(rows[0].keys()) if rows else [
            "case_id", "case_code", "case_year", "patient_age", "conclusion",
            "is_anonymized", "source", "created_at",
        ]
        writer = csv.DictWriter(buf, fieldnames=fieldnames)
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
