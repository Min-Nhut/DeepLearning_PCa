import io
import logging
import shutil
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from PIL import Image as PILImage
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..audit import write_audit_log
from ..database import get_db
from ..deps import get_current_user
from ..models import (
    Case,
    ClassificationResult,
    DiagnosticReview,
    Image,
    InferenceRun,
    PreprocessingResult,
    Slide,
    Stage3Result,
    User,
)
from ..preprocessing import run_preprocessing
from ..schemas import (
    CaseCreate,
    CaseGleasonOut,
    CaseOut,
    CaseReportImage,
    CaseReportOut,
    CaseUpdate,
    ImageOut,
    PreprocessingOut,
    SlideCreate,
    SlideMove,
    SlideOut,
)
from ..schemas.cases import CaseGleasonPerImage
from .reviews import _grade_group

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cases", tags=["cases"], dependencies=[Depends(get_current_user)])
image_router = APIRouter(prefix="/api/images", tags=["cases"], dependencies=[Depends(get_current_user)])

# backend/uploads — local file storage per PRD §10 ("Local File System").
UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads"

MAX_SLIDES_PER_CASE = 12  # PRD §8.3
MAX_IMAGES_PER_SLIDE = 8  # PRD §8.4

# Microscope captures (especially TIFF) can legitimately be several dozen MB — this caps
# memory use per upload without rejecting real captures. Keep in sync with the frontend's
# client-side check in pages/Upload.tsx.
MAX_UPLOAD_BYTES = 200 * 1024 * 1024

# Raise Pillow's decompression-bomb bar for legitimately large microscopy images, while
# still keeping *some* bound (not disabling the check outright).
PILImage.MAX_IMAGE_PIXELS = 300_000_000

# Derivatives generated once at upload time and served instead of the original, so
# CaseDetail/Upload's thumbnail grids never re-decode a multi-MB file on every view (see
# CLAUDE.md's Case/Slide/Image API section for the reasoning — WSI viewers like Aiforia
# apply the same idea at a much larger scale via tile pyramids; this is the right-sized
# version for single-frame captures).
THUMB_MAX_DIM = 320
VIEW_MAX_DIM = 2400

# Only these formats are accepted, matching PRD §8.4 ("JPG, PNG, TIFF") — validated by
# actually decoding the upload with Pillow, not by trusting the filename extension.
PIL_FORMAT_TO_EXT = {"JPEG": "jpg", "PNG": "png", "TIFF": "tiff"}
EXT_TO_MEDIA_TYPE = {"jpg": "image/jpeg", "png": "image/png"}


def _case_query(db: Session):
    return db.query(Case).options(selectinload(Case.slides).selectinload(Slide.images))


def _aggregate_gleason(
    reviews: list[tuple[int | None, int | None, float | None]],
) -> tuple[int | None, int | None]:
    """Case-level primary/secondary from one case's *confirmed* image reviews,
    each given as `(primary_pattern, secondary_pattern, cancer_area_percentage)`.

    Primary = the pattern with the greatest cumulative extent across the case;
    each confirmed image's own primary already represents that image's dominant
    pattern (see pipeline.py's aggregation), so its cancer area is that
    pattern's weight for this image. Secondary = the highest-grade pattern
    present anywhere else in the case, falling back to primary when it is the
    only one (single-pattern convention). All benign → `(None, None)`.

    Pure, so the case list and GET /{id}/gleason cannot drift apart: one
    computes it in bulk for many cases, the other for one, but the rule is here.
    """
    pattern_weight: dict[int, float] = {3: 0.0, 4: 0.0, 5: 0.0}
    primary_seen: set[int] = set()
    patterns_present: set[int] = set()
    for primary, secondary, area in reviews:
        if primary in (3, 4, 5):
            pattern_weight[primary] += area or 0.0
            primary_seen.add(primary)
            patterns_present.add(primary)
        if secondary in (3, 4, 5):
            patterns_present.add(secondary)

    if not patterns_present:
        return None, None

    if primary_seen:
        # Ties break towards the higher grade rather than dict order — two
        # equal-area foci must not under-grade the case.
        primary_pattern = max(primary_seen, key=lambda p: (pattern_weight[p], p))
    else:
        # No image reported a primary, yet a pattern was recorded as someone's
        # secondary. Degenerate, but reporting the pattern that is actually
        # there beats defaulting to the lowest grade.
        primary_pattern = max(patterns_present)

    others = [p for p in patterns_present if p != primary_pattern]
    return primary_pattern, (max(others) if others else primary_pattern)


def _attach_derived(db: Session, cases: list[Case]) -> None:
    """Fill in each case's workflow status and its AI/diagnosis summary, in place.

    None of this is a stored column, and none of it can be derived on the client
    — `CaseOut` carries slides and images but no runs, reviews or results. Every
    one of these fields was hard-coded in the frontend when the screens moved
    off mock data, so the badge read "Mới" forever and the Gleason and
    confidence columns showed "—" even for a case that had been fully signed
    off.

    Four grouped queries regardless of how many cases are listed, not a set per
    case — the same N+1 shape already fixed once in admin.list_users.
    """
    if not cases:
        return
    case_ids = [c.id for c in cases]

    image_counts = dict(
        db.query(Slide.case_id, func.count(Image.id))
        .join(Image, Image.slide_id == Slide.id)
        .filter(Slide.case_id.in_(case_ids))
        .group_by(Slide.case_id)
        .all()
    )
    run_rows = (
        db.query(Slide.case_id, InferenceRun.status, func.count(InferenceRun.id))
        .join(Image, Image.slide_id == Slide.id)
        .join(InferenceRun, InferenceRun.image_id == Image.id)
        .filter(Slide.case_id.in_(case_ids))
        .group_by(Slide.case_id, InferenceRun.status)
        .all()
    )
    # One pass over the reviews serves both the status badge (which needs counts
    # per status) and the case-level score (which needs the confirmed rows
    # themselves), rather than querying the same table twice.
    review_rows = (
        db.query(
            Slide.case_id,
            DiagnosticReview.status,
            Image.id,
            DiagnosticReview.primary_pattern,
            DiagnosticReview.secondary_pattern,
            DiagnosticReview.cancer_area_percentage,
        )
        .join(Image, Image.slide_id == Slide.id)
        .join(DiagnosticReview, DiagnosticReview.image_id == Image.id)
        .filter(Slide.case_id.in_(case_ids))
        .all()
    )
    # Confidence is the AI's own, averaged over the *latest completed* run per
    # image — an image re-run three times must count once, and a superseded
    # run's number is not what the doctor is looking at.
    latest_runs = (
        select(func.max(InferenceRun.id))
        .where(InferenceRun.status == "completed")
        .group_by(InferenceRun.image_id)
        .scalar_subquery()
    )
    confidence_by_case = dict(
        db.query(Slide.case_id, func.avg(ClassificationResult.primary_confidence))
        .join(Image, Image.slide_id == Slide.id)
        .join(InferenceRun, InferenceRun.image_id == Image.id)
        .join(ClassificationResult, ClassificationResult.run_id == InferenceRun.id)
        .filter(
            Slide.case_id.in_(case_ids),
            InferenceRun.id.in_(latest_runs),
            ClassificationResult.primary_confidence.isnot(None),
        )
        .group_by(Slide.case_id)
        .all()
    )

    # Stage 3 ISUP grade — averaged across the latest completed run per image,
    # same "latest run" discipline as confidence_by_case above.
    latest_runs_for_stage3 = (
        select(func.max(InferenceRun.id))
        .where(InferenceRun.status == "completed")
        .group_by(InferenceRun.image_id)
        .scalar_subquery()
    )
    isup_by_case = dict(
        db.query(Slide.case_id, func.avg(Stage3Result.isup_grade), func.avg(Stage3Result.confidence))
        .join(Image, Image.slide_id == Slide.id)
        .join(InferenceRun, InferenceRun.image_id == Image.id)
        .join(Stage3Result, Stage3Result.run_id == InferenceRun.id)
        .filter(
            Slide.case_id.in_(case_ids),
            InferenceRun.id.in_(latest_runs_for_stage3),
            Stage3Result.isup_grade.isnot(None),
        )
        .group_by(Slide.case_id)
        .all()
    )

    runs: dict[int, dict[str, int]] = {}
    for case_id, run_status, count in run_rows:
        runs.setdefault(case_id, {})[run_status] = count

    reviewed_images: dict[int, dict[str, set[int]]] = {}
    confirmed: dict[int, list[tuple[int | None, int | None, float | None]]] = {}
    for case_id, review_status, image_id, primary, secondary, area in review_rows:
        reviewed_images.setdefault(case_id, {}).setdefault(review_status, set()).add(image_id)
        if review_status == "confirmed":
            confirmed.setdefault(case_id, []).append((primary, secondary, area))

    for case in cases:
        images = image_counts.get(case.id, 0)
        case_runs = runs.get(case.id, {})
        case_reviews = reviewed_images.get(case.id, {})
        confirmed_images = len(case_reviews.get("confirmed", ()))

        if case_runs.get("pending", 0) or case_runs.get("running", 0):
            # Something is actively in flight, including waiting for the single
            # inference slot — that still reads as "processing" to a doctor.
            case.status = "processing"
        elif images and confirmed_images >= images:
            case.status = "reviewed"
        elif case_runs.get("completed", 0) or case_reviews:
            # There is something for the doctor to look at: a finished run, or a
            # review already started. A run that only ever *failed* deliberately
            # does not land here — nothing was produced to review, so the case
            # stays "new" rather than claiming a result exists.
            case.status = "review"
        else:
            case.status = "new"

        primary, secondary = _aggregate_gleason(confirmed.get(case.id, []))
        case.primary_pattern = primary
        case.secondary_pattern = secondary
        case.total_score = (primary + secondary) if primary and secondary else None
        case.images_confirmed = confirmed_images
        avg_confidence = confidence_by_case.get(case.id)
        # Stored 0-1; the UI shows a percentage, and converting here keeps every
        # caller from having to remember which one it is.
        case.ai_confidence = (avg_confidence * 100) if avg_confidence is not None else None

        # Stage 3 ISUP: round the per-case average to the nearest integer grade.
        isup_row = isup_by_case.get(case.id)
        if isup_row is not None:
            avg_isup, avg_isup_conf = isup_row
            case.isup_grade = round(float(avg_isup)) if avg_isup is not None else None
            case.isup_confidence = (float(avg_isup_conf) * 100) if avg_isup_conf is not None else None
        else:
            case.isup_grade = None
            case.isup_confidence = None


@router.get("", response_model=list[CaseOut])
def list_cases(
    db: Session = Depends(get_db),
    q: str | None = Query(None, description="Tìm theo mã số hoặc họ tên"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[Case]:
    query = _case_query(db)
    if q:
        like = f"%{q}%"
        query = query.filter((Case.case_code.like(like)) | (Case.patient_name.like(like)))
    cases = query.order_by(Case.created_at.desc()).offset(offset).limit(limit).all()
    _attach_derived(db, cases)
    return cases


@router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
def create_case(payload: CaseCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Case:
    case = Case(
        case_code=payload.case_code,
        case_year=payload.case_year,
        patient_name=payload.patient_name,
        patient_age=payload.patient_age,
        conclusion=payload.conclusion,
        created_by=user.id,
    )
    db.add(case)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Mã số + Mã năm đã tồn tại")
    write_audit_log(db, user, "create_case", "case", case.id)
    db.commit()
    db.refresh(case)
    return case


@router.get("/{case_id}", response_model=CaseOut)
def get_case(case_id: int, db: Session = Depends(get_db)) -> Case:
    case = _case_query(db).filter(Case.id == case_id).first()
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ca bệnh")
    _attach_derived(db, [case])
    return case


@router.get("/{case_id}/gleason", response_model=CaseGleasonOut)
def get_case_gleason(case_id: int, db: Session = Depends(get_db)) -> CaseGleasonOut:
    """Case-level Gleason/ISUP aggregation across every slide/image in the case
    (CAP protocol: a real biopsy report is signed per-case, not per-slide) —
    computed live from confirmed diagnostic_reviews, not persisted, same
    pattern as GET /api/stats/doctor. Only status='confirmed' reviews count
    (a draft could still change) — see CLAUDE.md for the full reasoning."""
    if db.get(Case, case_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ca bệnh")

    images_total = (
        db.query(func.count(Image.id))
        .join(Slide, Image.slide_id == Slide.id)
        .filter(Slide.case_id == case_id)
        .scalar() or 0
    )

    rows = (
        db.query(DiagnosticReview, Image)
        .join(Image, DiagnosticReview.image_id == Image.id)
        .join(Slide, Image.slide_id == Slide.id)
        .filter(Slide.case_id == case_id, DiagnosticReview.status == "confirmed")
        .all()
    )

    per_image = [
        CaseGleasonPerImage(
            image_id=image.id,
            primary_pattern=review.primary_pattern,
            secondary_pattern=review.secondary_pattern,
            cancer_area_percentage=review.cancer_area_percentage,
        )
        for review, image in rows
    ]

    if not per_image:
        return CaseGleasonOut(
            case_id=case_id, primary_pattern=None, secondary_pattern=None,
            total_score=None, grade_group=None,
            images_confirmed=0, images_total=images_total, per_image=[],
        )

    primary_pattern, secondary_pattern = _aggregate_gleason(
        [(p.primary_pattern, p.secondary_pattern, p.cancer_area_percentage) for p in per_image]
    )

    if primary_pattern is None or secondary_pattern is None:
        # Every confirmed image in the case was benign — a real, honest result,
        # not "not enough data".
        return CaseGleasonOut(
            case_id=case_id, primary_pattern=None, secondary_pattern=None,
            total_score=None, grade_group=None,
            images_confirmed=len(per_image), images_total=images_total, per_image=per_image,
        )

    return CaseGleasonOut(
        case_id=case_id,
        primary_pattern=primary_pattern,
        secondary_pattern=secondary_pattern,
        total_score=primary_pattern + secondary_pattern,
        grade_group=_grade_group(primary_pattern, secondary_pattern),
        images_confirmed=len(per_image),
        images_total=images_total,
        per_image=per_image,
    )


@router.patch("/{case_id}", response_model=CaseOut)
def update_case(
    case_id: int,
    payload: CaseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Case:
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ca bệnh")
    changed_fields = list(payload.model_dump(exclude_unset=True).keys())
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(case, field, value)
    write_audit_log(db, user, "update_case", "case", case.id, details=",".join(changed_fields) or None)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Mã số + Mã năm đã tồn tại")
    return get_case(case_id, db)


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(
    case_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Removes the case and everything under it (slides, images, AI runs,
    annotations, reviews).

    File cleanup: every image's UUID-prefixed file family is deleted via the
    shared _delete_image_files() helper.  Empty slide/case directories are
    pruned afterwards.  DB rows cascade automatically (ON DELETE CASCADE +
    PRAGMA foreign_keys=ON); files on disk do not, so this must be explicit.

    No per-doctor ownership check — matches the flat role model used
    everywhere else (delete_slide, delete_image)."""
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ca bệnh")

    # Gather all images across all slides of this case, then delete their
    # on-disk files before the DB rows cascade away (we need file_path).
    slides = db.query(Slide).filter(Slide.case_id == case_id).all()
    slide_dirs: set[Path] = set()
    total_images = 0
    for slide in slides:
        images = db.query(Image).filter(Image.slide_id == slide.id).all()
        for image in images:
            _delete_image_files(image)
            slide_dirs.add((UPLOAD_ROOT.parent / image.file_path).parent)
            total_images += 1
        # Remove the slide's upload directory when it is now empty.
        for d in slide_dirs:
            if d.is_dir() and not any(d.iterdir()):
                d.rmdir()
        slide_dirs.clear()

    # Remove the case-level upload directory if it exists and is now empty.
    case_dir = UPLOAD_ROOT / f"case_{case_id}"
    if case_dir.is_dir() and not any(case_dir.iterdir()):
        case_dir.rmdir()

    write_audit_log(
        db, user, "delete_case", "case", case.id,
        details=f"slides={len(slides)}, images={total_images}",
    )
    db.delete(case)
    db.commit()


@router.get("/{case_id}/report", response_model=CaseReportOut)
def get_case_report(case_id: int, db: Session = Depends(get_db)) -> CaseReportOut:
    """Everything a signed, case-level report needs, in one call.

    The per-image report screen was never the document a pathologist actually
    signs — under the CAP protocol one case (up to 12 slides) produces one
    report. This returns the case header, the aggregated Gleason score, every
    **confirmed** image's findings, and who signed them. Drafts are excluded on
    purpose: an unsigned opinion has no place on a signed document.
    """
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ca bệnh")

    rows = (
        db.query(DiagnosticReview, Image, Slide)
        .join(Image, DiagnosticReview.image_id == Image.id)
        .join(Slide, Image.slide_id == Slide.id)
        .filter(Slide.case_id == case_id, DiagnosticReview.status == "confirmed")
        .order_by(Slide.slide_number, Image.image_number)
        .all()
    )

    images = [
        CaseReportImage(
            image_id=image.id,
            slide_label=slide.legacy_slide_label or f"Slide {slide.slide_number}",
            image_number=image.image_number,
            magnification=image.magnification,
            primary_pattern=review.primary_pattern,
            secondary_pattern=review.secondary_pattern,
            total_score=review.total_score,
            grade_group=review.grade_group,
            cancer_area_percentage=review.cancer_area_percentage,
            tumor_length_mm=review.tumor_length_mm,
            biopsy_location=review.biopsy_location,
            pni_present=bool(review.pni_present),
            pni_notes=review.pni_notes,
            lvi_present=bool(review.lvi_present),
            lvi_notes=review.lvi_notes,
            free_notes=review.free_notes,
            needs_second_opinion=bool(review.needs_second_opinion),
            second_opinion_notes=review.second_opinion_notes,
            confirmed_at=review.confirmed_at,
            reviewed_by_name=review.reviewed_by_name,
        )
        for review, image, slide in rows
    ]

    # Order preserved (first signature first) rather than sorted — the sequence
    # is itself information on a multi-signer case.
    signed_by: list[str] = []
    for item in images:
        if item.reviewed_by_name and item.reviewed_by_name not in signed_by:
            signed_by.append(item.reviewed_by_name)

    images_total = (
        db.query(func.count(Image.id))
        .join(Slide, Image.slide_id == Slide.id)
        .filter(Slide.case_id == case_id)
        .scalar() or 0
    )

    return CaseReportOut(
        case_id=case.id,
        case_code=case.case_code,
        case_year=case.case_year,
        patient_name=case.patient_name,
        patient_age=case.patient_age,
        conclusion=case.conclusion,
        created_at=case.created_at,
        gleason=get_case_gleason(case_id, db),
        images=images,
        images_total=images_total,
        signed_by=signed_by,
    )


@router.post("/{case_id}/slides", response_model=SlideOut, status_code=status.HTTP_201_CREATED)
def add_slide(
    case_id: int,
    payload: SlideCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Slide:
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ca bệnh")
    count = db.query(func.count(Slide.id)).filter(Slide.case_id == case_id).scalar() or 0
    if count >= MAX_SLIDES_PER_CASE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Đã đạt giới hạn {MAX_SLIDES_PER_CASE} slide/ca bệnh")
    next_number = (db.query(func.max(Slide.slide_number)).filter(Slide.case_id == case_id).scalar() or 0) + 1
    # Default label follows the real pairing convention observed in the legacy
    # ImageCapture desktop app's own data ("Slide1-2", "Slide3-4", ...) — each
    # of our slide rows corresponds 1:1 to one of theirs, so slide_number N
    # maps to "Slide {2N-1}-{2N}". Still overridable via payload (e.g. by the
    # SQLite migration importer, which carries the legacy app's real label).
    label = payload.legacy_slide_label or f"Slide {2 * next_number - 1}-{2 * next_number}"
    slide = Slide(case_id=case_id, slide_number=next_number, legacy_slide_label=label)
    db.add(slide)
    db.flush()
    write_audit_log(db, user, "add_slide", "slide", slide.id, details=f"case_id={case_id}")
    db.commit()
    db.refresh(slide)
    return slide


async def _read_capped(file: UploadFile) -> bytes:
    """Reads the upload in chunks, rejecting it as soon as it exceeds
    MAX_UPLOAD_BYTES instead of buffering an unbounded file into memory first."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"File vượt quá giới hạn {MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _save_derivative(img: "PILImage.Image", max_dim: int, quality: int, dest: Path) -> None:
    copy = img.convert("RGB")
    copy.thumbnail((max_dim, max_dim), PILImage.LANCZOS)
    copy.save(dest, "JPEG", quality=quality)


def _process_and_store(raw: bytes, dest_dir: Path, stem: str) -> tuple[str, int, int]:
    """Blocking: decode+validate, then write the original plus thumb/view JPEG
    derivatives. Runs off the event loop via run_in_threadpool — this used to run
    directly inside the `async def` route and freeze the whole server for the
    duration of any large-file decode."""
    try:
        with PILImage.open(io.BytesIO(raw)) as img:
            img.load()
            pil_format = img.format
            width, height = img.size
            ext = PIL_FORMAT_TO_EXT.get(pil_format or "")
            if ext is None:
                raise ValueError(f"unsupported format: {pil_format}")

            dest_dir.mkdir(parents=True, exist_ok=True)
            (dest_dir / f"{stem}.{ext}").write_bytes(raw)
            _save_derivative(img, THUMB_MAX_DIM, 82, dest_dir / f"{stem}_thumb.jpg")
            _save_derivative(img, VIEW_MAX_DIM, 88, dest_dir / f"{stem}_view.jpg")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(str(exc)) from exc

    return ext, width, height


def _delete_image_files(image: Image) -> None:
    """Every derivative (thumb/view/normalized/tissue-mask) and every
    inference-run output for one image shares its UUID stem as a filename
    prefix, so one glob catches all of them. The deep-zoom pyramid writes a
    *directory* ({stem}_dzi_files/), hence rmtree vs unlink. DB rows cascade on
    their own; files on disk do not."""
    original_path = UPLOAD_ROOT.parent / image.file_path
    for f in original_path.parent.glob(f"{original_path.stem}*"):
        if f.is_dir():
            shutil.rmtree(f, ignore_errors=True)
        else:
            f.unlink(missing_ok=True)


@router.delete("/slides/{slide_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_slide(
    slide_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Removes the slide and everything under it. No per-doctor ownership check,
    matching the flat role model used everywhere else. Slide numbers are left
    with a gap rather than renumbered — add_slide() takes max+1 so a gap is
    harmless, and renumbering would silently change the label of slides the
    doctor didn't touch."""
    slide = db.get(Slide, slide_id)
    if slide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy slide")

    slide_dirs = set()
    for image in list(slide.images):
        _delete_image_files(image)
        slide_dirs.add((UPLOAD_ROOT.parent / image.file_path).parent)
    # The slide's own upload directory is dead once its images are gone — unlike
    # delete_image, which must leave the directory alone for the slide's other
    # images. Only removed when actually empty, so an unexpected leftover file
    # is preserved rather than silently destroyed.
    for d in slide_dirs:
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()

    write_audit_log(
        db, user, "delete_slide", "slide", slide.id,
        details=f"case_id={slide.case_id}, images={len(slide.images)}",
    )
    db.delete(slide)
    db.commit()


@router.post("/slides/{slide_id}/move", response_model=SlideOut)
def move_slide(
    slide_id: int,
    payload: SlideMove,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Slide:
    """Swaps this slide's position with its neighbour. `slides` has
    UNIQUE(case_id, slide_number), so the swap goes through a temporary
    out-of-range number instead of assigning the neighbour's value directly,
    which would collide mid-statement.

    Only the position moves — `legacy_slide_label` stays with its own slide,
    because that label names a real piece of glass ("Slide 3-4"); reordering the
    list must not rename it."""
    slide = db.get(Slide, slide_id)
    if slide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy slide")

    neighbours = (
        db.query(Slide)
        .filter(Slide.case_id == slide.case_id)
        .filter(Slide.slide_number < slide.slide_number if payload.direction == "up"
                else Slide.slide_number > slide.slide_number)
        .order_by(Slide.slide_number.desc() if payload.direction == "up" else Slide.slide_number.asc())
        .first()
    )
    if neighbours is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Slide đã ở đầu danh sách" if payload.direction == "up" else "Slide đã ở cuối danh sách",
        )

    mine, theirs = slide.slide_number, neighbours.slide_number
    slide.slide_number = -slide.id  # temporary, dodges UNIQUE(case_id, slide_number)
    db.flush()
    neighbours.slide_number = mine
    db.flush()
    slide.slide_number = theirs

    write_audit_log(
        db, user, "move_slide", "slide", slide.id,
        details=f"case_id={slide.case_id}, {mine}->{theirs}",
    )
    db.commit()
    db.refresh(slide)
    return slide


def _derivative_path(original_rel_path: str, size: Literal["thumb", "view"]) -> Path:
    original = UPLOAD_ROOT.parent / original_rel_path
    return original.with_name(f"{original.stem}_{size}.jpg")


@router.post("/slides/{slide_id}/images", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    slide_id: int,
    file: UploadFile,
    description: str | None = Form(None),
    source: str = Form("upload"),
    magnification: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Image:
    if source not in ("upload", "live_capture"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "source phải là 'upload' hoặc 'live_capture'")
    if magnification is not None and magnification not in ("4x", "10x", "20x", "40x"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "magnification phải là '4x', '10x', '20x' hoặc '40x'")

    slide = db.get(Slide, slide_id)
    if slide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy slide")

    count = db.query(func.count(Image.id)).filter(Image.slide_id == slide_id).scalar() or 0
    if count >= MAX_IMAGES_PER_SLIDE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Đã đạt giới hạn {MAX_IMAGES_PER_SLIDE} ảnh/slide")

    raw = await _read_capped(file)

    dest_dir = UPLOAD_ROOT / f"case_{slide.case_id}" / f"slide_{slide_id}"
    stem = uuid.uuid4().hex
    try:
        ext, width, height = await run_in_threadpool(_process_and_store, raw, dest_dir, stem)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File không phải ảnh hợp lệ (chỉ chấp nhận JPG/PNG/TIFF)")

    image = Image(
        slide_id=slide_id,
        image_number=count + 1,
        file_path=str((dest_dir / f"{stem}.{ext}").relative_to(UPLOAD_ROOT.parent)),
        description=description,
        width_px=width,
        height_px=height,
        format=ext,
        uploaded_by=user.id,
        source=source,
        magnification=magnification,
    )
    db.add(image)
    db.flush()

    # Automatic preprocessing (PRD §8.4) — runs against the just-written `_view`
    # derivative, not the full-res original. Best-effort: a preprocessing
    # failure (e.g. an exotic format cv2 can't decode) must not fail the
    # upload itself, since the image was already validated/stored by Pillow.
    view_path = dest_dir / f"{stem}_view.jpg"
    try:
        pre = await run_in_threadpool(run_preprocessing, view_path, dest_dir, stem)
        normalized_rel = (
            str(Path(pre["normalized_image_path"]).relative_to(UPLOAD_ROOT.parent))
            if pre["normalized_image_path"]
            else None
        )
        tissue_mask_rel = (
            str(Path(pre["tissue_mask_path"]).relative_to(UPLOAD_ROOT.parent))
            if pre["tissue_mask_path"]
            else None
        )
        db.add(
            PreprocessingResult(
                image_id=image.id,
                normalized_image_path=normalized_rel,
                tissue_mask_path=tissue_mask_rel,
                is_blurry=1 if pre["is_blurry"] else 0,
                quality_score=pre["quality_score"],
            )
        )
    except Exception:
        logger.exception("Preprocessing failed for image_id=%s (upload itself still succeeded)", image.id)

    write_audit_log(db, user, "upload_image", "image", image.id, details=f"slide_id={slide_id}, source={source}")
    db.commit()
    db.refresh(image)
    return image


@image_router.get("/{image_id}", response_model=ImageOut)
def get_image(image_id: int, db: Session = Depends(get_db)) -> Image:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")
    return image


@image_router.get("/{image_id}/preprocessing", response_model=PreprocessingOut)
def get_preprocessing(image_id: int, db: Session = Depends(get_db)) -> PreprocessingOut:
    result = db.query(PreprocessingResult).filter(PreprocessingResult.image_id == image_id).first()
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ảnh chưa được xử lý")
    return PreprocessingOut(
        image_id=result.image_id,
        is_blurry=bool(result.is_blurry),
        quality_score=result.quality_score,
        has_normalized_image=result.normalized_image_path is not None,
        has_tissue_mask=result.tissue_mask_path is not None,
        processed_at=result.processed_at,
    )


@image_router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")

    # Every derivative (thumb/view/normalized/tissue-mask) and every inference-run
    # output (segmask/heatmap) for this image shares its UUID stem as a filename
    # prefix — see _process_and_store/run_preprocessing/_execute — so one glob on
    # the stem catches all of them without touching other images in the same
    # slide directory. DB rows cascade automatically (ON DELETE CASCADE +
    # PRAGMA foreign_keys=ON), but files on disk don't, so this must be explicit.
    # Every derivative/tile shares the UUID stem as a filename prefix — but the
    # deep-zoom tile pyramid (see app/dzi.py) writes a *directory*
    # ({stem}_dzi_files/), not just files, so a plain unlink() would raise
    # IsADirectoryError on it.
    original_path = UPLOAD_ROOT.parent / image.file_path
    stem = original_path.stem
    for f in original_path.parent.glob(f"{stem}*"):
        if f.is_dir():
            shutil.rmtree(f, ignore_errors=True)
        else:
            f.unlink(missing_ok=True)

    write_audit_log(db, user, "delete_image", "image", image.id, details=f"slide_id={image.slide_id}")
    db.delete(image)
    db.commit()


@image_router.get("/{image_id}/file")
def get_image_file(
    image_id: int,
    db: Session = Depends(get_db),
    size: Literal["thumb", "view", "original"] = Query("thumb"),
) -> Response:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")

    if size in ("thumb", "view"):
        path = _derivative_path(image.file_path, size)
        if not path.exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Ảnh thu nhỏ không tồn tại trên đĩa")
        return Response(content=path.read_bytes(), media_type="image/jpeg")

    path = UPLOAD_ROOT.parent / image.file_path
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File ảnh không còn tồn tại trên đĩa")

    if image.format == "tiff":
        # Browsers can't render <img src=".tiff">, so convert on the fly for the rare
        # request that actually wants the full-resolution original as an image.
        with PILImage.open(path) as img:
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")

    media_type = EXT_TO_MEDIA_TYPE.get(image.format or "", "application/octet-stream")
    return Response(content=path.read_bytes(), media_type=media_type)
