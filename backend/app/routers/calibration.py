from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..audit import write_audit_log
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import MagnificationCalibration, User
from ..schemas import CalibrationOut, CalibrationUpdate

router = APIRouter(prefix="/api", tags=["calibration"])

VALID_MAGNIFICATIONS = ("4x", "10x", "20x", "40x")


@router.get("/calibration", response_model=list[CalibrationOut], dependencies=[Depends(get_current_user)])
def list_calibration(db: Session = Depends(get_db)) -> list[MagnificationCalibration]:
    """Whatever magnifications have been calibrated so far — trống mặc định, không
    có dòng nào cho một độ phóng đại nghĩa là "chưa hiệu chỉnh" cho nó."""
    return db.query(MagnificationCalibration).all()


@router.put("/admin/calibration/{magnification}", response_model=CalibrationOut)
def set_calibration(
    magnification: str,
    payload: CalibrationUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> MagnificationCalibration:
    """Admin-only — this is a physical-instrument constant shared by every doctor's
    measurements, not a per-user preference, so it's gated like the rest of Admin's
    configuration screens (Models, Migration, Users)."""
    if magnification not in VALID_MAGNIFICATIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "magnification phải là '4x', '10x', '20x' hoặc '40x'")
    row = db.get(MagnificationCalibration, magnification)
    if row is None:
        row = MagnificationCalibration(magnification=magnification, um_per_pixel=payload.um_per_pixel)
        db.add(row)
    else:
        row.um_per_pixel = payload.um_per_pixel
    row.updated_by = admin.id
    row.updated_at = db.execute(text("SELECT datetime('now')")).scalar()
    write_audit_log(db, admin, "update_calibration", "magnification_calibration", None, details=f"{magnification}={payload.um_per_pixel}")
    db.commit()
    db.refresh(row)
    return row
