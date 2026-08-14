import re

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..dzi import dzi_tile_path, ensure_dzi
from ..models import Image
from .cases import UPLOAD_ROOT

router = APIRouter(prefix="/api/images", tags=["dzi"], dependencies=[Depends(get_current_user)])

# Tile filenames are always "{col}_{row}.jpg" per the DZI convention pyvips'
# dzsave() produces — reject anything else to keep this path-traversal-safe
# even though `filename`/`level` are otherwise plain path params.
_TILE_FILENAME_RE = re.compile(r"^\d+_\d+\.jpg$")


def _original_path(image_id: int, db: Session):
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ảnh")
    path = UPLOAD_ROOT.parent / image.file_path
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File ảnh không còn tồn tại trên đĩa")
    return path


@router.get("/{image_id}/dzi")
async def get_dzi_descriptor(image_id: int, db: Session = Depends(get_db)) -> Response:
    original = _original_path(image_id, db)
    dzi_path = await run_in_threadpool(ensure_dzi, original)
    return Response(content=dzi_path.read_bytes(), media_type="application/xml")


@router.get("/{image_id}/dzi_files/{level}/{filename}")
def get_dzi_tile(image_id: int, level: int, filename: str, db: Session = Depends(get_db)) -> Response:
    if not _TILE_FILENAME_RE.match(filename):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tên tile không hợp lệ")
    original = _original_path(image_id, db)
    tile = dzi_tile_path(original, level, filename)
    if not tile.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tile chưa tồn tại — gọi GET .../dzi trước")
    return Response(content=tile.read_bytes(), media_type="image/jpeg")
