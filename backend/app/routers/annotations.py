import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..audit import write_audit_log
from ..database import get_db
from ..deps import get_current_user
from ..models import Image, ManualAnnotation, User
from ..schemas import AnnotationCreate, AnnotationOut, AnnotationUpdate, Point

router = APIRouter(prefix="/api/images", tags=["annotations"], dependencies=[Depends(get_current_user)])


def _area_percentage(points: list[Point]) -> float:
    """Shoelace formula on the 0-100 coordinate space, expressed as a % of the
    full image area. A spatial estimate only — there is no physical
    calibration, so this is never presented as a clinical measurement."""
    n = len(points)
    total = 0.0
    for i in range(n):
        p1, p2 = points[i], points[(i + 1) % n]
        total += p1.x * p2.y - p2.x * p1.y
    area = abs(total) / 2  # in (percentage-unit)^2, max possible is 100*100=10000
    return area / 10000 * 100


def _to_out(row: ManualAnnotation) -> AnnotationOut:
    points = [Point(**p) for p in json.loads(row.points)]
    return AnnotationOut(
        id=row.id,
        image_id=row.image_id,
        points=points,
        gleason_pattern=row.gleason_pattern,
        note=row.note,
        area_percentage=_area_percentage(points),
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_annotation(db: Session, image_id: int, annotation_id: int) -> ManualAnnotation:
    row = db.get(ManualAnnotation, annotation_id)
    if row is None or row.image_id != image_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy vùng đánh dấu")
    return row


@router.get("/{image_id}/annotations", response_model=list[AnnotationOut])
def list_annotations(image_id: int, db: Session = Depends(get_db)) -> list[AnnotationOut]:
    # Without this an unknown or deleted image answers 200 with an empty list,
    # which reads as "this image has no regions marked" — indistinguishable from
    # the image being gone, and inconsistent with every other per-image GET
    # here (/file, /review, /preprocessing all 404). POST already checks.
    if db.get(Image, image_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")
    rows = (
        db.query(ManualAnnotation)
        .filter(ManualAnnotation.image_id == image_id)
        .order_by(ManualAnnotation.created_at)
        .all()
    )
    return [_to_out(r) for r in rows]


@router.post("/{image_id}/annotations", response_model=AnnotationOut, status_code=status.HTTP_201_CREATED)
def create_annotation(
    image_id: int,
    payload: AnnotationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnnotationOut:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")
    if len(payload.points) < 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vùng đánh dấu cần ít nhất 3 điểm")

    row = ManualAnnotation(
        image_id=image_id,
        points=json.dumps([p.model_dump() for p in payload.points]),
        gleason_pattern=payload.gleason_pattern,
        note=payload.note,
        created_by=user.id,
    )
    db.add(row)
    db.flush()
    write_audit_log(db, user, "create_annotation", "manual_annotation", row.id, details=f"image_id={image_id}")
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.patch("/{image_id}/annotations/{annotation_id}", response_model=AnnotationOut)
def update_annotation(
    image_id: int,
    annotation_id: int,
    payload: AnnotationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AnnotationOut:
    row = _get_annotation(db, image_id, annotation_id)

    data = payload.model_dump(exclude_unset=True)
    if "points" in data:
        if len(data["points"]) < 3:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vùng đánh dấu cần ít nhất 3 điểm")
        row.points = json.dumps(data["points"])
        del data["points"]
    for field, value in data.items():
        setattr(row, field, value)

    write_audit_log(db, user, "update_annotation", "manual_annotation", row.id)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{image_id}/annotations/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_annotation(
    image_id: int,
    annotation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    row = _get_annotation(db, image_id, annotation_id)
    write_audit_log(db, user, "delete_annotation", "manual_annotation", row.id)
    db.delete(row)
    db.commit()
