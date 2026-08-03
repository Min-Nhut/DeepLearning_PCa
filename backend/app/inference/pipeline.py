"""Orchestration: tile -> segment -> classify (only cancer-flagged patches) ->
aggregate. Confirmed order with the user: segmentation always runs first, and
its output gates which patches classification even looks at.
"""
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
import torch

from ..routers.reviews import _grade_group
from . import registry
from .tiling import PATCH_SIZE, tile_image

IMAGENET_MEAN = np.array((0.485, 0.456, 0.406), dtype=np.float32)
IMAGENET_STD = np.array((0.229, 0.224, 0.225), dtype=np.float32)

SEG_INPUT_SIZE = 256
CLF_INPUT_SIZE = 224

# 0=background, 1=stroma, 2=benign, 3=gleason_3, 4=gleason_4, 5=gleason_5 — same
# palette as the training notebooks (CLASS_NAMES_SEG / MASK_COLOR_LIST).
MASK_COLORS_BGR = [
    (0x1a, 0x1a, 0x1a)[::-1],
    (0x9e, 0x9e, 0x9e)[::-1],
    (0x2c, 0xa0, 0x2c)[::-1],
    (0xff, 0xd6, 0x0a)[::-1],
    (0xff, 0x7f, 0x0e)[::-1],
    (0xd6, 0x27, 0x28)[::-1],
]
CANCER_CLASSES = (3, 4, 5)  # gleason_3/4/5 pixel values in the mask
TISSUE_CLASSES = (2, 3, 4, 5)  # benign + cancer, excludes background/stroma

CLF_IDX_TO_PATTERN = {1: 3, 2: 4, 3: 5}  # LABEL2IDX from the classification notebook


def _to_tensor(rgb: np.ndarray, size: int) -> torch.Tensor:
    """Resize (bilinear) + ImageNet-normalize + HWC->CHW, matching exactly
    what the training notebooks did via `albumentations`' `A.Resize` +
    `A.Normalize` — reimplemented directly with cv2/numpy instead of
    depending on `albumentations` itself, whose `albucore` dependency pulls
    in a `numkong` native extension with a broken DLL on this machine."""
    resized = cv2.resize(rgb, (size, size), interpolation=cv2.INTER_LINEAR)
    normalized = (resized.astype(np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
    chw = normalized.transpose(2, 0, 1)
    return torch.from_numpy(chw).float().unsqueeze(0)


@dataclass
class PipelineResult:
    mask_path: Path
    cancer_area_px: int
    total_tissue_area_px: int
    cancer_area_percentage: float | None
    heatmap_path: Path | None
    primary_pattern: int | None
    primary_confidence: float | None
    secondary_pattern: int | None
    secondary_confidence: float | None
    grade_group: int | None


def _segment_patch(model: torch.nn.Module, patch_bgr: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2RGB)
    tensor = _to_tensor(rgb, SEG_INPUT_SIZE)
    with torch.no_grad():
        logits = model(tensor)
    pred = logits.argmax(dim=1).squeeze(0).numpy().astype(np.uint8)
    if pred.shape != patch_bgr.shape[:2]:
        pred = cv2.resize(pred, (patch_bgr.shape[1], patch_bgr.shape[0]), interpolation=cv2.INTER_NEAREST)
    return pred


def _classify_patch(model: torch.nn.Module, patch_bgr: np.ndarray) -> tuple[int, float]:
    rgb = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2RGB)
    tensor = _to_tensor(rgb, CLF_INPUT_SIZE)
    with torch.no_grad():
        logits = model(tensor)
    probs = torch.softmax(logits, dim=1).squeeze(0)
    idx = int(probs.argmax().item())
    return idx, float(probs[idx].item())


def run_pipeline(image_path: Path, seg_arch: str, clf_arch: str, output_dir: Path, stem: str) -> PipelineResult:
    """Blocking — FastAPI's BackgroundTasks runs sync callables in a
    threadpool automatically, so this doesn't need an explicit
    run_in_threadpool wrapper at the call site."""
    seg_model = registry.load("segmentation", seg_arch)
    clf_model = registry.load("classification", clf_arch)

    bgr = cv2.imread(str(image_path))
    if bgr is None:
        raise ValueError(f"could not decode {image_path}")
    h, w = bgr.shape[:2]
    full_mask = np.zeros((h, w), dtype=np.uint8)

    patches = tile_image(image_path, patch_size=PATCH_SIZE, tissue_only=True)

    # Per-pattern classified area (in px) across all patches — drives the
    # primary/secondary aggregation below.
    pattern_area: dict[int, int] = {3: 0, 4: 0, 5: 0}
    pattern_confidence_sum: dict[int, float] = {3: 0.0, 4: 0.0, 5: 0.0}
    pattern_patch_count: dict[int, int] = {3: 0, 4: 0, 5: 0}
    heatmap = np.zeros((h, w), dtype=np.float32)

    for patch in patches:
        ph, pw = patch.image.shape[:2]
        pred = _segment_patch(seg_model, patch.image)
        full_mask[patch.y:patch.y + ph, patch.x:patch.x + pw] = pred

        has_cancer_pixels = np.isin(pred, CANCER_CLASSES).any()
        if not has_cancer_pixels:
            continue

        # Segmentation gates classification (confirmed order) — only patches
        # flagged as containing cancer-relevant tissue get classified.
        idx, confidence = _classify_patch(clf_model, patch.image)
        pattern = CLF_IDX_TO_PATTERN.get(idx)
        if pattern is None:
            continue  # classified as benign despite segmentation flagging cancer pixels
        # Classification is patch-level (one label per whole patch), but the
        # "area" contributed to that pattern uses segmentation's pixel count
        # for that specific class within the patch — combines the patch's
        # classification decision with segmentation's finer spatial extent,
        # rather than crediting the whole patch to one label.
        patch_area = int(np.count_nonzero(pred == pattern))
        pattern_area[pattern] += patch_area
        pattern_confidence_sum[pattern] += confidence * patch_area
        pattern_patch_count[pattern] += 1
        heatmap[patch.y:patch.y + ph, patch.x:patch.x + pw] = confidence

    cancer_area_px = int(np.isin(full_mask, CANCER_CLASSES).sum())
    total_tissue_area_px = int(np.isin(full_mask, TISSUE_CLASSES).sum())
    cancer_area_percentage = (cancer_area_px / total_tissue_area_px * 100) if total_tissue_area_px else None

    # Primary = pattern with the largest classified area; secondary = next
    # largest if a second pattern exists, else same as primary (single-pattern
    # case, standard ISUP convention) — no separate "Stage 3" model, confirmed.
    ranked = sorted((p for p in (3, 4, 5) if pattern_area[p] > 0), key=lambda p: pattern_area[p], reverse=True)
    primary_pattern = ranked[0] if ranked else None
    secondary_pattern = ranked[1] if len(ranked) > 1 else primary_pattern
    primary_confidence = (
        pattern_confidence_sum[primary_pattern] / pattern_area[primary_pattern] if primary_pattern and pattern_area[primary_pattern] else None
    )
    secondary_confidence = (
        pattern_confidence_sum[secondary_pattern] / pattern_area[secondary_pattern]
        if secondary_pattern and pattern_area[secondary_pattern] else primary_confidence
    )
    grade_group = _grade_group(primary_pattern, secondary_pattern) if primary_pattern and secondary_pattern else None

    output_dir.mkdir(parents=True, exist_ok=True)
    mask_path = output_dir / f"{stem}_segmask.png"
    colored = np.zeros((h, w, 3), dtype=np.uint8)
    for cls, color in enumerate(MASK_COLORS_BGR):
        colored[full_mask == cls] = color
    cv2.imwrite(str(mask_path), colored)

    heatmap_path = None
    if heatmap.max() > 0:
        heatmap_path = output_dir / f"{stem}_heatmap.png"
        heatmap_color = cv2.applyColorMap((heatmap * 255).astype(np.uint8), cv2.COLORMAP_JET)
        cv2.imwrite(str(heatmap_path), heatmap_color)

    return PipelineResult(
        mask_path=mask_path,
        cancer_area_px=cancer_area_px,
        total_tissue_area_px=total_tissue_area_px,
        cancer_area_percentage=cancer_area_percentage,
        heatmap_path=heatmap_path,
        primary_pattern=primary_pattern,
        primary_confidence=primary_confidence,
        secondary_pattern=secondary_pattern,
        secondary_confidence=secondary_confidence,
        grade_group=grade_group,
    )
