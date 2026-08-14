"""Deep Zoom (DZI) tile pyramid generation via pyvips — the "Google Maps for
images" technique real WSI viewers use: instead of shipping one downsized
raster and CSS-scaling it (which never reveals detail beyond what's already
in that raster), the client fetches small tiles at whatever resolution level
it's currently zoomed to, straight from the full-resolution original.

pyvips.dzsave() already produces the standard DZI layout
({name}.dzi + {name}_files/{level}/{col}_{row}.jpg) that OpenSeadragon reads
natively — no hand-rolled tiling math needed here.
"""
from pathlib import Path

import pyvips

DZI_TILE_SIZE = 256
DZI_OVERLAP = 1


def _dzi_paths(original_path: Path) -> tuple[Path, Path]:
    prefix = original_path.with_name(f"{original_path.stem}_dzi")
    return prefix.with_suffix(".dzi"), prefix.with_name(f"{prefix.name}_files")


def ensure_dzi(original_path: Path) -> Path:
    """Blocking — run via run_in_threadpool. Generates the tile pyramid once
    (lazily, on first view) and caches it on disk next to the original;
    subsequent calls are a no-op cache hit."""
    dzi_path, files_dir = _dzi_paths(original_path)
    if dzi_path.exists() and files_dir.exists():
        return dzi_path

    prefix = dzi_path.with_suffix("")
    image = pyvips.Image.new_from_file(str(original_path), access="sequential")
    image.dzsave(str(prefix), tile_size=DZI_TILE_SIZE, overlap=DZI_OVERLAP, suffix=".jpg[Q=85]")
    return dzi_path


def dzi_tile_path(original_path: Path, level: int, filename: str) -> Path:
    _, files_dir = _dzi_paths(original_path)
    return files_dir / str(level) / filename
