import io
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from PIL import Image as PILImage
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..audit import write_audit_log
from ..database import get_db
from ..deps import get_current_user
from ..models import Case, Image, PreprocessingResult, Slide, User
from ..preprocessing import run_preprocessing
from ..schemas import (
    CaseCreate,
    CaseOut,
    CaseUpdate,
    ImageOut,
    PreprocessingOut,
    SlideCreate,
    SlideOut,
)

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
    return query.order_by(Case.created_at.desc()).offset(offset).limit(limit).all()


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
    return case


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
    slide = Slide(case_id=case_id, slide_number=next_number, legacy_slide_label=payload.legacy_slide_label)
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


def _derivative_path(original_rel_path: str, size: Literal["thumb", "view"]) -> Path:
    original = UPLOAD_ROOT.parent / original_rel_path
    return original.with_name(f"{original.stem}_{size}.jpg")


@router.post("/slides/{slide_id}/images", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    slide_id: int,
    file: UploadFile,
    description: str | None = Form(None),
    source: str = Form("upload"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Image:
    if source not in ("upload", "live_capture"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "source phải là 'upload' hoặc 'live_capture'")

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
        pass

    write_audit_log(db, user, "upload_image", "image", image.id, details=f"slide_id={slide_id}, source={source}")
    db.commit()
    db.refresh(image)
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
    original_path = UPLOAD_ROOT.parent / image.file_path
    stem = original_path.stem
    for f in original_path.parent.glob(f"{stem}*"):
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
