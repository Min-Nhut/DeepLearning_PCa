from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..audit import write_audit_log
from ..database import get_db
from ..deps import get_current_user
from ..models import Case, DiagnosticReview, Image, Slide, User
from ..schemas import DiagnosticReviewOut, DiagnosticReviewUpdate, FlaggedReviewOut

router = APIRouter(prefix="/api/images", tags=["reviews"], dependencies=[Depends(get_current_user)])
flagged_router = APIRouter(prefix="/api/reviews", tags=["reviews"], dependencies=[Depends(get_current_user)])

# ISUP Grade Group formula — mirrors frontend/src/data/mock.ts's grade()
# exactly, reimplemented here so the backend is the source of truth once the
# frontend is wired to real reviews.
def _grade_group(primary: int, secondary: int) -> int:
    total = primary + secondary
    if total <= 6:
        return 1
    if primary == 3 and secondary == 4:
        return 2
    if primary == 4 and secondary == 3:
        return 3
    if total == 8:
        return 4
    return 5


def _latest_review(db: Session, image_id: int) -> DiagnosticReview | None:
    return (
        db.query(DiagnosticReview)
        .filter(DiagnosticReview.image_id == image_id)
        .order_by(DiagnosticReview.created_at.desc())
        .first()
    )


@router.get("/{image_id}/review", response_model=DiagnosticReviewOut)
def get_review(image_id: int, db: Session = Depends(get_db)) -> DiagnosticReview:
    review = _latest_review(db, image_id)
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có kết quả đánh giá cho ảnh này")
    return review


@router.patch("/{image_id}/review", response_model=DiagnosticReviewOut)
def update_review(
    image_id: int,
    payload: DiagnosticReviewUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DiagnosticReview:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")

    review = _latest_review(db, image_id)
    if review is None:
        review = DiagnosticReview(image_id=image_id)
        db.add(review)
    elif review.status == "confirmed":
        raise HTTPException(status.HTTP_423_LOCKED, "Kết quả đã được xác nhận, không thể chỉnh sửa")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field in ("pni_present", "lvi_present", "needs_second_opinion"):
            value = 1 if value else 0
        setattr(review, field, value)

    if review.primary_pattern is not None and review.secondary_pattern is not None:
        review.total_score = review.primary_pattern + review.secondary_pattern
        review.grade_group = _grade_group(review.primary_pattern, review.secondary_pattern)

    write_audit_log(db, user, "update_review", "diagnostic_review", image_id)
    db.commit()
    db.refresh(review)
    return review


@router.post("/{image_id}/review/confirm", response_model=DiagnosticReviewOut)
def confirm_review(
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DiagnosticReview:
    review = _latest_review(db, image_id)
    if review is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chưa có bản nháp đánh giá để xác nhận")
    if review.status == "confirmed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Kết quả đã được xác nhận trước đó")

    review.status = "confirmed"
    review.reviewed_by = user.id
    review.confirmed_at = db.execute(text("SELECT datetime('now')")).scalar()

    write_audit_log(db, user, "confirm_review", "diagnostic_review", image_id)
    db.commit()
    db.refresh(review)
    return review


@flagged_router.get("/flagged", response_model=list[FlaggedReviewOut])
def list_flagged_reviews(db: Session = Depends(get_db)) -> list[FlaggedReviewOut]:
    """Flat worklist for the "cần hội chẩn" flag — deliberately not nested under
    /cases so it doesn't require patching CaseOut's ORM-driven serialization just
    to surface a per-image flag. Excludes already-confirmed reviews — once locked,
    the case is no longer "pending" a second opinion."""
    rows = (
        db.query(DiagnosticReview, Image, Slide, Case)
        .join(Image, DiagnosticReview.image_id == Image.id)
        .join(Slide, Image.slide_id == Slide.id)
        .join(Case, Slide.case_id == Case.id)
        .filter(DiagnosticReview.needs_second_opinion == 1, DiagnosticReview.status != "confirmed")
        .order_by(DiagnosticReview.created_at.desc())
        .all()
    )
    return [
        FlaggedReviewOut(
            review_id=review.id,
            image_id=image.id,
            case_id=case.id,
            case_label=f"{case.case_code}/{case.case_year}" if case.case_year else case.case_code,
            slide_label=slide.legacy_slide_label or f"Slide {slide.slide_number}",
            second_opinion_notes=review.second_opinion_notes,
            created_at=review.created_at,
        )
        for review, image, slide, case in rows
    ]
