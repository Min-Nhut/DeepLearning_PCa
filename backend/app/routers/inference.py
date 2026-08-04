from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..ai_models_config import list_model_infos
from ..audit import write_audit_log
from ..database import SessionLocal, get_db
from ..deps import get_current_user
from ..inference import architectures, registry
from ..inference.pipeline import run_pipeline
from ..inference.registry import ModelNotAvailableError
from ..models import ClassificationResult, Image, InferenceRun, SegmentationResult, User
from ..schemas import (
    ClassificationResultOut,
    InferenceRunOut,
    InferenceTriggerRequest,
    ModelInfo,
    SegmentationResultOut,
)
from .cases import UPLOAD_ROOT

router = APIRouter(prefix="/api", tags=["inference"], dependencies=[Depends(get_current_user)])


@router.get("/models", response_model=list[ModelInfo])
def list_available_models() -> list[ModelInfo]:
    """Same data as GET /api/admin/models, just not admin-gated — the doctor-facing
    model-selector on the Pipeline screen needs to read checkpoint_available/metrics
    too, and doctors aren't admins."""
    return list_model_infos()


def _run_out(run: InferenceRun, seg: SegmentationResult | None, clf: ClassificationResult | None) -> InferenceRunOut:
    return InferenceRunOut(
        id=run.id,
        image_id=run.image_id,
        status=run.status,
        segmentation_model_version=run.segmentation_model_version,
        classification_model_version=run.classification_model_version,
        error_message=run.error_message,
        triggered_by=run.triggered_by,
        started_at=run.started_at,
        completed_at=run.completed_at,
        created_at=run.created_at,
        segmentation=SegmentationResultOut(
            id=seg.id, run_id=seg.run_id, cancer_area_px=seg.cancer_area_px,
            total_tissue_area_px=seg.total_tissue_area_px, cancer_area_percentage=seg.cancer_area_percentage,
            has_mask=bool(seg.mask_file_path), created_at=seg.created_at,
        ) if seg else None,
        classification=ClassificationResultOut(
            id=clf.id, run_id=clf.run_id, primary_pattern=clf.primary_pattern,
            primary_confidence=clf.primary_confidence, secondary_pattern=clf.secondary_pattern,
            secondary_confidence=clf.secondary_confidence, created_at=clf.created_at,
        ) if clf else None,
    )


def _execute(run_id: int, image_path: Path, seg_arch: str, clf_arch: str, dest_dir: Path, stem: str) -> None:
    """Background task body. Opens its OWN DB session — the request-scoped
    session from `get_db()` is already closed by the time BackgroundTasks
    actually runs this (Starlette executes background tasks after the
    response has been sent), so reusing it would fail."""
    db = SessionLocal()
    try:
        run = db.get(InferenceRun, run_id)
        run.status = "running"
        run.started_at = db.execute(text("SELECT datetime('now')")).scalar()
        db.commit()

        result = run_pipeline(image_path, seg_arch, clf_arch, dest_dir, stem)

        db.add(SegmentationResult(
            run_id=run_id,
            mask_file_path=str(result.mask_path.relative_to(UPLOAD_ROOT.parent)),
            cancer_area_px=result.cancer_area_px,
            total_tissue_area_px=result.total_tissue_area_px,
            cancer_area_percentage=result.cancer_area_percentage,
        ))
        db.add(ClassificationResult(
            run_id=run_id,
            primary_pattern=result.primary_pattern,
            primary_confidence=result.primary_confidence,
            secondary_pattern=result.secondary_pattern,
            secondary_confidence=result.secondary_confidence,
        ))
        run.status = "completed"
        run.completed_at = db.execute(text("SELECT datetime('now')")).scalar()
        db.commit()
    except ModelNotAvailableError as exc:
        db.rollback()
        run = db.get(InferenceRun, run_id)
        run.status = "failed"
        run.error_message = str(exc)
        db.commit()
    except Exception as exc:  # best-effort — a pipeline crash must never leave the run stuck at "running"
        db.rollback()
        run = db.get(InferenceRun, run_id)
        run.status = "failed"
        run.error_message = f"Lỗi không mong đợi: {exc}"
        db.commit()
    finally:
        db.close()


@router.post("/images/{image_id}/inference", response_model=InferenceRunOut, status_code=status.HTTP_201_CREATED)
def trigger_inference(
    image_id: int,
    payload: InferenceTriggerRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> InferenceRunOut:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")

    # Falls back to the first *available* checkpoint if none requested, or to
    # the first known architecture name if none are available at all — the
    # background task then discovers that missing checkpoint and fails the
    # run with a clear message, rather than rejecting the request outright.
    seg_arch = payload.segmentation_model or next(
        iter(registry.list_available("segmentation") or architectures.SEGMENTATION_ARCHITECTURES)
    )
    clf_arch = payload.classification_model or next(
        iter(registry.list_available("classification") or architectures.CLASSIFICATION_ARCHITECTURES)
    )

    run = InferenceRun(
        image_id=image_id,
        status="pending",
        segmentation_model_version=seg_arch,
        classification_model_version=clf_arch,
        triggered_by=user.id,
    )
    db.add(run)
    db.flush()
    write_audit_log(db, user, "run_inference", "inference_run", run.id, details=f"image_id={image_id}, seg={seg_arch}, clf={clf_arch}")
    db.commit()
    db.refresh(run)

    original_path = UPLOAD_ROOT.parent / image.file_path
    dest_dir = original_path.parent
    stem = f"{original_path.stem}_run{run.id}"
    background_tasks.add_task(_execute, run.id, original_path, seg_arch, clf_arch, dest_dir, stem)

    return _run_out(run, None, None)


@router.get("/images/{image_id}/inference", response_model=InferenceRunOut)
def get_latest_inference(image_id: int, db: Session = Depends(get_db)) -> InferenceRunOut:
    run = (
        db.query(InferenceRun)
        .filter(InferenceRun.image_id == image_id)
        .order_by(InferenceRun.created_at.desc())
        .first()
    )
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có lần chạy AI nào cho ảnh này")
    seg = db.query(SegmentationResult).filter(SegmentationResult.run_id == run.id).first()
    clf = db.query(ClassificationResult).filter(ClassificationResult.run_id == run.id).first()
    return _run_out(run, seg, clf)


@router.get("/inference-runs/{run_id}/mask")
def get_mask(run_id: int, db: Session = Depends(get_db)) -> Response:
    seg = db.query(SegmentationResult).filter(SegmentationResult.run_id == run_id).first()
    if seg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có mask cho lần chạy này")
    path = UPLOAD_ROOT.parent / seg.mask_file_path
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File mask không còn tồn tại trên đĩa")
    return Response(content=path.read_bytes(), media_type="image/png")
