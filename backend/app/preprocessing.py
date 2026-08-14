"""Classical-CV preprocessing (PRD §8.4): color normalization, tissue
detection, blur/quality check. No AI model involved — these run
automatically at upload time against the already-generated `_view`
derivative (<=2400px), not the full-res original, since Macenko's matrix
math would be needlessly slow/memory-heavy on a multi-thousand-pixel TIFF
for no accuracy benefit at this prototype's scale.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

BLUR_VARIANCE_THRESHOLD = 100.0  # tunable heuristic, not a calibrated clinical value

# Macenko reference stain vectors + max concentrations, fit against a real
# 300-image random sample of the PANDA train set (Radboud) — see
# stain_reference.json for the full extraction metadata. Replaces the earlier
# generic textbook Macenko values (from the original 2009 paper, not derived
# from this project's own training data) — every new image is normalized
# towards *this* dataset's real, typical staining appearance instead.
_REFERENCE = json.loads((Path(__file__).parent / "stain_reference.json").read_text(encoding="utf-8"))
# JSON stores stain_matrix as (2 stains x 3 RGB channels) — one row per stain
# vector — transposed here to (3 channels x 2 stains) to match this module's
# `stain_matrix @ concentrations -> OD` convention (columns are stain vectors).
_REFERENCE_STAIN_MATRIX = np.array(_REFERENCE["stain_matrix"]).T
_REFERENCE_MAX_CONC = np.array(_REFERENCE["max_concentration"])
# Luminosity-based tissue/background split (standard Macenko-implementation
# convention, distinct from an OD-magnitude threshold): a pixel is tissue if
# its normalized brightness is below this — background glass/mounting medium
# sits close to 1.0 (white), stained tissue is darker.
_LUMINOSITY_THRESHOLD = _REFERENCE["luminosity_threshold"]
# Symmetric percentile split for the two extreme stain-vector angles in the
# SVD projection (the reference's own "upper" percentile; the code below
# derives the matching lower one as 100 - this).
_ANGULAR_PERCENTILE = _REFERENCE["angular_percentile"]


# Mean LAB colour of tissue pixels in the training data, measured over 139
# tissue patches from 12 real PANDA slides. Used to decide *whether* a patch
# needs stain normalisation at all — see needs_stain_normalization().
_TRAINING_LAB = np.array([179.2, 152.4, 125.0], dtype=np.float32)

# Distance beyond which a patch is treated as out-of-distribution. Chosen from
# the measured distributions, not picked: PANDA patches sit at p50=12.4 /
# p90=24.4, real microscope captures at p50=40.9 / p90=72.8, so 30 falls above
# PANDA's 90th percentile and below the microscope median. At this value ~6.5%
# of PANDA patches are normalised unnecessarily and ~78% of microscope patches
# are caught.
#
# The threshold is deliberately biased towards *not* normalising, because the
# two errors are not symmetric (see docs/ABLATION_STAIN_NORM.md): normalising an
# in-domain patch costs ~82% of mean IoU, while skipping an out-of-domain patch
# merely leaves it where it already was — normalisation only closes ~27% of that
# gap anyway.
_OUT_OF_DOMAIN_LAB_DISTANCE = 30.0

# Pixels brighter than this are glass, not tissue, and would dominate the mean.
_LAB_BACKGROUND_GRAY = 220


def lab_distance_from_training(bgr: np.ndarray) -> float | None:
    """How far this patch's tissue colour sits from the training distribution.
    None when there are too few tissue pixels to say anything."""
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).reshape(-1)
    tissue = lab[gray < _LAB_BACKGROUND_GRAY]
    if len(tissue) < 100:
        return None
    return float(np.linalg.norm(tissue.mean(axis=0) - _TRAINING_LAB))


def needs_stain_normalization(bgr: np.ndarray) -> bool:
    """True when the patch is far enough from the training colour distribution
    that pulling it closer is worth the risk.

    Normalising unconditionally was measurably destroying accuracy on data that
    was already in-domain, while normalising nothing leaves real microscope
    captures (measured ~40 LAB units away) far outside what the models ever saw.
    Neither is acceptable, so the decision is made per patch.
    """
    distance = lab_distance_from_training(bgr)
    if distance is None:
        return False  # can't tell — leave the pixels alone
    return distance > _OUT_OF_DOMAIN_LAB_DISTANCE


def _laplacian_variance(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _tissue_mask(bgr: np.ndarray) -> np.ndarray:
    """Otsu threshold on the saturation channel — standard tissue-vs-background
    split for H&E slides (stained tissue is saturated, background/glass is
    near-white/low-saturation)."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    saturation = hsv[:, :, 1]
    _, mask = cv2.threshold(saturation, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return mask


def normalize_stain(bgr: np.ndarray) -> np.ndarray:
    """Macenko stain normalization against the real PANDA-derived reference
    (see `_REFERENCE`/stain_reference.json). Public — also used by
    `inference/tiling.py` to normalize each tissue patch before it's fed to
    the segmentation/classification models, not just for the upload-time QC
    derivative. Raises ValueError on degenerate (near-blank / no-tissue)
    input instead of producing garbage output — callers must handle that and
    fall back to the un-normalized image."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).reshape(-1, 3).astype(np.float64)

    # Luminosity-based tissue/background split (matches how the reference
    # itself was fit — see _LUMINOSITY_THRESHOLD above), not an OD-magnitude
    # threshold: background (glass/mounting medium) is bright/near-white,
    # tissue is darker.
    luminosity = rgb.mean(axis=1) / 255.0
    tissue_pixels = rgb[luminosity < _LUMINOSITY_THRESHOLD]
    if tissue_pixels.shape[0] < 100:
        raise ValueError("not enough tissue pixels for stain normalization")

    od = -np.log((rgb + 1.0) / 256.0)
    od_thresh = -np.log((tissue_pixels + 1.0) / 256.0)

    # Stain vectors via SVD on the OD covariance, project onto the plane of
    # the two largest eigenvectors, find robust extreme angles (this is the
    # standard Macenko algorithm).
    cov = np.cov(od_thresh.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    top_two = eigvecs[:, [-1, -2]]

    projection = od_thresh @ top_two
    angles = np.arctan2(projection[:, 1], projection[:, 0])
    min_angle = np.percentile(angles, 100 - _ANGULAR_PERCENTILE)
    max_angle = np.percentile(angles, _ANGULAR_PERCENTILE)

    v_min = top_two @ np.array([np.cos(min_angle), np.sin(min_angle)])
    v_max = top_two @ np.array([np.cos(max_angle), np.sin(max_angle)])
    if v_min[0] > v_max[0]:
        stain_matrix = np.stack([v_min, v_max], axis=1)
    else:
        stain_matrix = np.stack([v_max, v_min], axis=1)
    stain_matrix = np.abs(stain_matrix)

    concentrations, *_ = np.linalg.lstsq(stain_matrix, od.T, rcond=None)
    max_conc = np.percentile(concentrations, 99, axis=1)
    max_conc[max_conc == 0] = 1e-6
    normalized_conc = concentrations * (_REFERENCE_MAX_CONC / max_conc)[:, None]

    od_normalized = _REFERENCE_STAIN_MATRIX @ normalized_conc
    rgb_normalized = 256.0 * np.exp(-od_normalized) - 1.0
    rgb_normalized = np.clip(rgb_normalized, 0, 255).T.reshape(bgr.shape).astype(np.uint8)
    return cv2.cvtColor(rgb_normalized, cv2.COLOR_RGB2BGR)


def run_preprocessing(view_path: Path, dest_dir: Path, stem: str) -> dict:
    """Blocking — run via run_in_threadpool by the caller, same as image
    upload processing. Returns a dict of fields for a PreprocessingResult row."""
    bgr = cv2.imread(str(view_path))
    if bgr is None:
        raise ValueError(f"could not decode {view_path} for preprocessing")

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    quality_score = _laplacian_variance(gray)
    is_blurry = quality_score < BLUR_VARIANCE_THRESHOLD

    tissue_mask_path: str | None = None
    mask = _tissue_mask(bgr)
    mask_dest = dest_dir / f"{stem}_tissuemask.png"
    cv2.imwrite(str(mask_dest), mask)
    tissue_mask_path = str(mask_dest)

    normalized_image_path: str | None = None
    try:
        normalized = normalize_stain(bgr)
        norm_dest = dest_dir / f"{stem}_normalized.jpg"
        cv2.imwrite(str(norm_dest), normalized, [cv2.IMWRITE_JPEG_QUALITY, 88])
        normalized_image_path = str(norm_dest)
    except (ValueError, np.linalg.LinAlgError):
        # Degenerate (near-blank/no-tissue) image — skip normalization rather
        # than fail the whole upload; blur/tissue results are still useful.
        normalized_image_path = None

    return {
        "quality_score": quality_score,
        "is_blurry": is_blurry,
        "tissue_mask_path": tissue_mask_path,
        "normalized_image_path": normalized_image_path,
    }
