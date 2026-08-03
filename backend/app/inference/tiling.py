"""500x500 grid patch extraction matching the training data's own convention
(see CLAUDE.md's Dataset section): edge windows shift inward to stay in-bounds
rather than being padded, so every patch is a genuine full-size crop — never a
padded/blank edge patch.
"""
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from ..preprocessing import _tissue_mask

PATCH_SIZE = 500
MIN_TISSUE_FRACTION = 0.05  # skip patches that are essentially pure background/glass


@dataclass
class Patch:
    image: np.ndarray  # BGR, PATCH_SIZE x PATCH_SIZE x 3 (or smaller, if the source is)
    x: int
    y: int


def _grid_starts(total: int, patch_size: int) -> list[int]:
    if total <= patch_size:
        return [0]
    starts = list(range(0, total - patch_size + 1, patch_size))
    last_start = total - patch_size
    if starts[-1] != last_start:
        starts.append(last_start)  # shift the final window inward instead of padding
    return starts


def tile_image(path: Path, patch_size: int = PATCH_SIZE, tissue_only: bool = True) -> list[Patch]:
    """Blocking — run via run_in_threadpool by the caller. Tiles the
    full-resolution original (not the `_view` derivative) since training
    patches are 500x500px at the WSI's native resolution — downscaling first
    would break the physical-scale match the whole approach depends on."""
    bgr = cv2.imread(str(path))
    if bgr is None:
        raise ValueError(f"could not decode {path} for tiling")
    h, w = bgr.shape[:2]

    patches: list[Patch] = []
    for y in _grid_starts(h, patch_size):
        for x in _grid_starts(w, patch_size):
            crop = bgr[y:y + patch_size, x:x + patch_size]
            if tissue_only:
                mask = _tissue_mask(crop)
                tissue_fraction = float(np.count_nonzero(mask)) / mask.size
                if tissue_fraction < MIN_TISSUE_FRACTION:
                    continue
            patches.append(Patch(image=crop, x=x, y=y))
    return patches
