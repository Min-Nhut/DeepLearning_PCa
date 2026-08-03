"""Classical-CV preprocessing (PRD §8.4): color normalization, tissue
detection, blur/quality check. No AI model involved — these run
automatically at upload time against the already-generated `_view`
derivative (<=2400px), not the full-res original, since Macenko's matrix
math would be needlessly slow/memory-heavy on a multi-thousand-pixel TIFF
for no accuracy benefit at this prototype's scale.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

BLUR_VARIANCE_THRESHOLD = 100.0  # tunable heuristic, not a calibrated clinical value

# Fixed Macenko reference stain vectors + max concentrations (standard H&E
# reference values from the original Macenko et al. 2009 paper / widely reused
# in stain-normalization implementations) — the "target" appearance every
# image gets normalized towards.
_REFERENCE_STAIN_MATRIX = np.array([[0.5626, 0.2159], [0.7201, 0.8012], [0.4062, 0.5581]])
_REFERENCE_MAX_CONC = np.array([1.9705, 1.0308])
_OD_THRESHOLD = 0.15
_ANGULAR_PERCENTILE = 1


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


def _macenko_normalize(bgr: np.ndarray) -> np.ndarray:
    """Macenko stain normalization against a fixed reference stain vector.
    Raises ValueError on degenerate (near-blank / no-tissue) images instead of
    producing garbage output — caller must handle that and skip normalization."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).reshape(-1, 3).astype(np.float64)

    # Optical density transform; drop near-transparent (background) pixels.
    od = -np.log((rgb + 1.0) / 256.0)
    od_thresh = od[np.all(od > _OD_THRESHOLD, axis=1)]
    if od_thresh.shape[0] < 100:
        raise ValueError("not enough tissue pixels for stain normalization")

    # Stain vectors via SVD on the OD covariance, project onto the plane of
    # the two largest eigenvectors, find robust extreme angles (this is the
    # standard Macenko algorithm).
    cov = np.cov(od_thresh.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    top_two = eigvecs[:, [-1, -2]]

    projection = od_thresh @ top_two
    angles = np.arctan2(projection[:, 1], projection[:, 0])
    min_angle = np.percentile(angles, _ANGULAR_PERCENTILE)
    max_angle = np.percentile(angles, 100 - _ANGULAR_PERCENTILE)

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
        normalized = _macenko_normalize(bgr)
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
