"""500x500 grid patch extraction matching the training data's own convention
(see CLAUDE.md's Dataset section): edge windows shift inward to stay in-bounds
rather than being padded, so every patch cropped *from a larger image* is a
genuine full-size crop — never a padded/blank edge patch. The one exception is
a source image that's smaller than patch_size in its own right (real legacy
desktop-app captures range from 193x120 to ~2752x1536, see CLAUDE.md's Legacy
desktop app integration subsection) — there's no larger image to shift
within, so that whole image is edge-padded up to patch_size instead of being
stretched. Padding (not resizing) is what preserves the physical
pixel-to-real-world-area relationship the model depends on: cv2.resize()
would anisotropically stretch e.g. a 193x120 capture to a 500x500 (or
straight to 224x224) square, distorting gland shapes and mismatching the
physical scale training patches were extracted at; padding just extends the
edges, leaving every real pixel's physical size untouched.
"""
import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from ..preprocessing import needs_stain_normalization, normalize_stain
from .scale import TRAINING_UM_PER_PIXEL, patch_size_for

logger = logging.getLogger(__name__)

PATCH_SIZE = 500

# Tissue detection for "is this patch worth running the models on".
#
# This used to be a per-patch Otsu (`preprocessing._tissue_mask`) with a 5%
# area threshold, which was wrong in both directions:
#   * it DROPPED real tissue — a patch under 5% tissue was skipped entirely, so
#     that tissue was never segmented and silently stayed background in the
#     stitched mask (0.49% of all tissue across 8 real PANDA slides, up to 1.03%
#     on one of them — thin strands at a biopsy's edge are exactly where this
#     bites);
#   * and it INVENTED tissue — Otsu always returns a split, even for a
#     single-peak histogram, so uniform glass carrying ordinary sensor noise
#     measured 38-43% "tissue" and was kept. PANDA's background is exactly 255
#     with no noise, which is why this never showed up in testing, but a real
#     microscope capture is noisy: blank patches would be fed to the models,
#     land in the mask, and skew Stage 3 (which averages over every "tissue"
#     patch).
#
# Both are fixed by thresholding against ONE global value per image instead of
# a per-patch adaptive one, with an absolute floor for when the image has no
# tissue at all (a blank capture is unimodal, so its Otsu value is meaningless).
# The floor is measured, not guessed: real H&E tissue saturation starts at ~39
# (1st percentile on a real slide, median 74), while glass with realistic
# sensor noise (sigma=6) tops out at 36.
MIN_SATURATION = 40
# ANY tissue keeps the patch — no area fraction — so nothing real is skipped.
# The only filter is a 3x3 morphological opening, which drops isolated
# saturated specks. That distinction is what separates tissue from noise:
# sensor noise is scattered single pixels, tissue is contiguous. Measured over
# 8 real slides (148M tissue pixels) it costs 364 pixels — by construction the
# only thing it can drop is a structure that is nowhere 3px thick, i.e. under
# 1.46um at PANDA's 0.486um/pixel, well below a single nucleus. In exchange,
# blank glass with camera noise is rejected outright (sigma=6 and sigma=12:
# 0/12 patches kept, versus 8/12 and 12/12 without the opening). Very heavy
# noise (sigma=18) still leaks — noted, not solved.
_TISSUE_OPEN_KERNEL = np.ones((3, 3), np.uint8)
_OTSU_DOWNSCALE = 8  # global threshold is estimated on a 1/8 copy — same value, far cheaper


def _global_tissue_threshold(bgr: np.ndarray) -> int:
    """One saturation threshold for the whole image (stained tissue is
    saturated, glass is not), floored at MIN_SATURATION."""
    saturation = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[:, :, 1]
    h, w = saturation.shape
    small = cv2.resize(
        saturation,
        (max(1, w // _OTSU_DOWNSCALE), max(1, h // _OTSU_DOWNSCALE)),
        interpolation=cv2.INTER_AREA,
    )
    otsu, _ = cv2.threshold(small, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return int(max(otsu, MIN_SATURATION))


@dataclass
class Patch:
    image: np.ndarray  # BGR, always exactly patch_size x patch_size x 3
    x: int
    y: int
    # Region of `image` this patch OWNS in the source image, measured from its
    # top-left corner. Equal to patch_size for every interior patch; smaller for
    # a patch whose window was shifted inward (it shares that band with its
    # predecessor) and for a source image smaller than patch_size (the rest of
    # `image` is padding, not real pixels). See _exclusive_extents().
    w_valid: int
    h_valid: int


def _grid_starts(total: int, patch_size: int) -> list[int]:
    if total <= patch_size:
        return [0]
    starts = list(range(0, total - patch_size + 1, patch_size))
    last_start = total - patch_size
    if starts[-1] != last_start:
        starts.append(last_start)  # shift the final window inward instead of padding
    return starts


def _exclusive_extents(starts: list[int], total: int, patch_size: int) -> list[int]:
    """How much of each window is exclusively its own: up to the next window's
    start, or to the image edge for the last one.

    The inward-shifted final window overlaps its predecessor (e.g. a 6144px axis
    gives starts ...5500, 5644 -> a 356px shared band). Handing every source
    pixel to exactly one window makes the stitched mask and the per-pattern area
    counts agree by construction — previously the mask let the later patch
    overwrite the band while the area accumulator counted it twice, inflating
    the per-pattern totals that decide primary/secondary (+7.4% on a real
    6144x26112 slide).

    Capping the last window at `total` also covers a source image smaller than
    patch_size: there the extent is the image's own size, so the edge-replicated
    padding never reaches the mask.
    """
    ends = starts[1:] + [min(starts[-1] + patch_size, total)]
    return [end - start for start, end in zip(starts, ends)]


def _pad_to_size(crop: np.ndarray, patch_size: int) -> np.ndarray:
    """Only ever triggers when the *source image itself* is smaller than
    patch_size (see module docstring) — a crop taken from a larger image via
    _grid_starts() is always already exactly patch_size on both axes."""
    ch, cw = crop.shape[:2]
    if ch == patch_size and cw == patch_size:
        return crop
    return cv2.copyMakeBorder(crop, 0, patch_size - ch, 0, patch_size - cw, cv2.BORDER_REPLICATE)


def tile_image(
    path: Path,
    patch_size: int = PATCH_SIZE,
    tissue_only: bool = True,
    um_per_pixel: float | None = None,
) -> list[Patch]:
    """Blocking — run via run_in_threadpool by the caller. Tiles the
    full-resolution original (not the `_view` derivative) since training
    patches are 500x500px at the WSI's native resolution — downscaling first
    would break the physical-scale match the whole approach depends on.

    `um_per_pixel`, when known, resizes the *grid* rather than the image: the
    crop covers the same 243.1um of tissue a training patch did, and the models'
    own 224/256 resize then lands it at the same apparent scale (see scale.py).
    Unknown resolution means no rescaling at all — never a guess."""
    bgr = cv2.imread(str(path))
    if bgr is None:
        raise ValueError(f"could not decode {path} for tiling")
    native_patch = patch_size_for(um_per_pixel, patch_size)
    if native_patch != patch_size:
        logger.info(
            "%s: %.5f um/px vs training %.5f -> patch %dpx instead of %dpx (same %.1fum of tissue)",
            path.name, um_per_pixel, TRAINING_UM_PER_PIXEL,
            native_patch, patch_size, patch_size * TRAINING_UM_PER_PIXEL,
        )
    patch_size = native_patch
    h, w = bgr.shape[:2]
    ys, xs = _grid_starts(h, patch_size), _grid_starts(w, patch_size)
    y_extents = _exclusive_extents(ys, h, patch_size)
    x_extents = _exclusive_extents(xs, w, patch_size)
    threshold = _global_tissue_threshold(bgr) if tissue_only else 0

    patches: list[Patch] = []
    for y, h_valid in zip(ys, y_extents):
        for x, w_valid in zip(xs, x_extents):
            crop = bgr[y:y + patch_size, x:x + patch_size]
            if tissue_only:
                # Tested on the region this patch OWNS, and on the RAW crop
                # before any padding. Owned region because tissue sitting in a
                # shared band belongs to the neighbour that will write it to
                # the mask — testing the full patch would keep redundant
                # patches. Raw crop because padding a small source image
                # replicates its edge, so a 193x120 capture that is 40.6%
                # tissue would measure 3.8% once padded and be dropped whole.
                owned = crop[:h_valid, :w_valid]
                saturation = cv2.cvtColor(owned, cv2.COLOR_BGR2HSV)[:, :, 1]
                tissue = (saturation >= threshold).astype(np.uint8)
                tissue = cv2.morphologyEx(tissue, cv2.MORPH_OPEN, _TISSUE_OPEN_KERNEL)
                if not tissue.any():
                    continue
            # Stain-normalise towards the training distribution, but ONLY for
            # patches that are actually far from it. Doing this unconditionally
            # was measured to cost 82% of mean IoU on in-domain data, because
            # the models were trained without any colour augmentation and have
            # no colour robustness; doing it never leaves real microscope
            # captures ~40 LAB units outside anything the models ever saw. See
            # docs/ABLATION_STAIN_NORM.md for both measurements.
            if needs_stain_normalization(crop):
                try:
                    crop = normalize_stain(crop)
                except (ValueError, np.linalg.LinAlgError):
                    # Degenerate patch (mostly glass despite passing the tissue
                    # test) — the raw crop is the honest fallback.
                    pass
            # Pad last, so the replicated border copies already-normalized
            # pixels and the Macenko fit above never sees duplicated edges.
            patches.append(Patch(
                image=_pad_to_size(crop, patch_size), x=x, y=y, w_valid=w_valid, h_valid=h_valid,
            ))
    return patches
