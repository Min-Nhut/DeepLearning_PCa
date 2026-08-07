import json
import logging
import threading
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
from ..inference.pipeline import run_pipeline, run_stage3_fusion
from ..inference.registry import ModelNotAvailableError
from ..inference.scale import read_file_um_per_pixel
from ..models import (
    ClassificationResult,
    Image,
    InferenceRun,
    MagnificationCalibration,
    SegmentationResult,
    Stage3Result,
    User,
)
from ..schemas import (
    ClassificationResultOut,
    InferenceRunOut,
    InferenceTriggerRequest,
    ModelInfo,
    SegmentationResultOut,
    Stage3ResultOut,
)
from .cases import UPLOAD_ROOT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["inference"], dependencies=[Depends(get_current_user)])

# Running more than 1 inference pipeline at a time was observed to OOM-crash
# the whole server (each run loads multiple PyTorch models + processes many
# patches; this dev machine only had ~4.6GB free of 15.7GB total) — a plain
# threading.Semaphore serializes actual pipeline execution while a run waits
# for its turn (FastAPI's BackgroundTasks run sync callables in a thread pool,
# so multiple runs really would execute concurrently without this). Scoped to
# a single uvicorn worker process, which is how this app is actually run today
# (no --workers flag) — a multi-worker deployment would need a cross-process
# mechanism instead (e.g. a DB-backed queue or a real task broker).
MAX_CONCURRENT_INFERENCE = 1
_inference_semaphore = threading.Semaphore(MAX_CONCURRENT_INFERENCE)


@router.get("/models", response_model=list[ModelInfo])
def list_available_models() -> list[ModelInfo]:
    """Same data as GET /api/admin/models, just not admin-gated — the doctor-facing
    model-selector on the Pipeline screen needs to read checkpoint_available/metrics
    too, and doctors aren't admins."""
    return list_model_infos()


def _run_out(
    run: InferenceRun,
    seg: SegmentationResult | None,
    clf: ClassificationResult | None,
    stage3: Stage3Result | None = None,
) -> InferenceRunOut:
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
        stage3=Stage3ResultOut(
            id=stage3.id, run_id=stage3.run_id, isup_grade=stage3.isup_grade,
            confidence=stage3.confidence,
            classification_pct=json.loads(stage3.classification_pct_json) if stage3.classification_pct_json else None,
            created_at=stage3.created_at,
        ) if stage3 else None,
    )


def _resolve_um_per_pixel(db: Session, image: Image, image_path: Path) -> float | None:
    """The image's real µm/pixel, so patches can cover the same tissue area the
    models were trained on (see inference/scale.py). File metadata first — it
    describes this exact file — then the admin's stage-micrometer calibration
    for the magnification recorded at capture. Returns None when neither is
    available, which means no rescaling rather than a guessed one."""
    from_file = read_file_um_per_pixel(image_path)
    if from_file:
        return from_file
    if image.magnification:
        row = db.get(MagnificationCalibration, image.magnification)
        if row and row.um_per_pixel:
            return float(row.um_per_pixel)
        logger.info(
            "image %s: no calibration for %s — tiling at native scale, no rescale",
            image.id, image.magnification,
        )
    return None


def _execute(
    run_id: int,
    image_path: Path,
    seg_arch: str,
    clf_arch: str,
    dest_dir: Path,
    stem: str,
    um_per_pixel: float | None = None,
) -> None:
    """Background task body. Opens its OWN DB session — the request-scoped
    session from `get_db()` is already closed by the time BackgroundTasks
    actually runs this (Starlette executes background tasks after the
    response has been sent), so reusing it would fail.

    Blocks on `_inference_semaphore` before doing any real work — the run's
    DB status stays "pending" for that whole wait (only flips to "running"
    once the slot is actually acquired), so this needs no frontend change:
    Pipeline.tsx already polls and displays "pending" correctly."""
    logger.info("Run %s: waiting for an inference slot (seg=%s, clf=%s)", run_id, seg_arch, clf_arch)
    with _inference_semaphore:
        logger.info("Run %s: acquired inference slot, starting", run_id)
        db = SessionLocal()
        try:
            run = db.get(InferenceRun, run_id)
            run.status = "running"
            run.started_at = db.execute(text("SELECT datetime('now')")).scalar()
            db.commit()

            result = run_pipeline(image_path, seg_arch, clf_arch, dest_dir, stem, um_per_pixel=um_per_pixel)

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

            # Stage 3 (WSI-level ML fusion, see inference/fusion.py) is best-effort —
            # its own independent classification pass over every tissue patch, on
            # top of the run above. Missing model files or a fit failure must never
            # fail the whole run, same discipline as preprocessing.py's Macenko step.
            # Still logged (not silently swallowed) — a failure here used to be
            # invisible everywhere: not in the DB, not on screen, not in any log.
            try:
                isup_grade, confidence, classification_pct = run_stage3_fusion(image_path, um_per_pixel=um_per_pixel)
                db.add(Stage3Result(
                    run_id=run_id,
                    isup_grade=isup_grade,
                    confidence=confidence,
                    classification_pct_json=json.dumps(classification_pct),
                ))
            except Exception:
                logger.exception("Run %s: Stage 3 fusion failed (main run still completes without it)", run_id)

            run.status = "completed"
            run.completed_at = db.execute(text("SELECT datetime('now')")).scalar()
            db.commit()
            logger.info("Run %s: completed", run_id)
        except ModelNotAvailableError as exc:
            db.rollback()
            run = db.get(InferenceRun, run_id)
            run.status = "failed"
            run.error_message = str(exc)
            db.commit()
            logger.warning("Run %s: failed — model not available: %s", run_id, exc)
        except Exception as exc:  # best-effort — a pipeline crash must never leave the run stuck at "running"
            db.rollback()
            run = db.get(InferenceRun, run_id)
            run.status = "failed"
            run.error_message = f"Lỗi không mong đợi: {exc}"
            db.commit()
            logger.exception("Run %s: failed unexpectedly", run_id)
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
    # Resolved here, on the request's session — _execute() runs after the
    # response is sent and opens its own session, and this needs the Image row.
    um_per_pixel = _resolve_um_per_pixel(db, image, original_path)
    background_tasks.add_task(
        _execute, run.id, original_path, seg_arch, clf_arch, dest_dir, stem, um_per_pixel,
    )

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
    stage3 = db.query(Stage3Result).filter(Stage3Result.run_id == run.id).first()
    return _run_out(run, seg, clf, stage3)


@router.get("/inference-runs/{run_id}/mask")
def get_mask(run_id: int, db: Session = Depends(get_db)) -> Response:
    seg = db.query(SegmentationResult).filter(SegmentationResult.run_id == run_id).first()
    if seg is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có mask cho lần chạy này")
    path = UPLOAD_ROOT.parent / seg.mask_file_path
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File mask không còn tồn tại trên đĩa")
    return Response(content=path.read_bytes(), media_type="image/png")
