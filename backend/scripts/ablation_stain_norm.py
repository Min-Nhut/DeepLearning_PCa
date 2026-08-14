#!/usr/bin/env python
"""Does Macenko stain normalisation at inference time help or hurt?

The models were trained on raw patches — resize plus ImageNet mean/std, no
colour normalisation. This app normalises every patch before inference anyway,
on the argument that a real microscope capture needs pulling towards PANDA's
colour distribution. That is a genuine train/inference distribution shift, and
so far it has only been *documented*, never measured.

Two experiments, because they answer different questions:

  A. PANDA slides, which have ground-truth masks. Here normalisation is applied
     to data that is already in-domain, so it is expected to cost a little
     accuracy. This measures how much.

  B. Real microscope captures (test_image/YD_image_test). No ground truth
     exists, so accuracy cannot be measured — what is reported instead is how
     far the prediction moves, which bounds how much is at stake in the
     deployment case the normalisation exists for.

Metrics follow the training notebooks: mean IoU and mean DSC over the tissue
classes only (2..5), from a confusion matrix accumulated across all patches
rather than averaged per patch.

Usage:
    python scripts/ablation_stain_norm.py --slides 5 --patches 40
"""
import argparse
import os
import sys
import warnings
from pathlib import Path

import cv2
import numpy as np

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.inference import registry  # noqa: E402
from app.inference.pipeline import _segment_patch  # noqa: E402
from app.inference.tiling import (  # noqa: E402
    PATCH_SIZE,
    _exclusive_extents,
    _global_tissue_threshold,
    _grid_starts,
    _TISSUE_OPEN_KERNEL,
)
from app.preprocessing import needs_stain_normalization, normalize_stain  # noqa: E402

REPO = Path(__file__).resolve().parent.parent.parent
PANDA_IMAGES = REPO / "test_image" / "PANDA_image_test" / "train_images"
PANDA_MASKS = REPO / "test_image" / "PANDA_image_test" / "train_label_masks"
YD_IMAGES = REPO / "test_image" / "YD_image_test"

TISSUE_CLASSES = (2, 3, 4, 5)  # matches the notebooks' REPORT_CLASSES
CLASS_NAMES = {2: "benign", 3: "gleason_3", 4: "gleason_4", 5: "gleason_5"}
N_CLASSES = 6


def tissue_patch_coords(bgr: np.ndarray, limit: int) -> list[tuple[int, int, int, int]]:
    """Same tissue test the real pipeline uses, so the sample is drawn from the
    patches inference would actually process."""
    threshold = _global_tissue_threshold(bgr)
    h, w = bgr.shape[:2]
    ys, xs = _grid_starts(h, PATCH_SIZE), _grid_starts(w, PATCH_SIZE)
    y_ext = _exclusive_extents(ys, h, PATCH_SIZE)
    x_ext = _exclusive_extents(xs, w, PATCH_SIZE)

    coords = []
    for y, eh in zip(ys, y_ext):
        for x, ew in zip(xs, x_ext):
            owned = bgr[y:y + eh, x:x + ew]
            sat = cv2.cvtColor(owned, cv2.COLOR_BGR2HSV)[:, :, 1]
            mask = cv2.morphologyEx((sat >= threshold).astype(np.uint8), cv2.MORPH_OPEN, _TISSUE_OPEN_KERNEL)
            if mask.any():
                coords.append((x, y, ew, eh))
    if len(coords) <= limit:
        return coords
    # Even stride rather than random, so the sample spans the whole slide and
    # the run is reproducible without seeding.
    step = len(coords) / limit
    return [coords[int(i * step)] for i in range(limit)]


def confusion(pred: np.ndarray, truth: np.ndarray) -> np.ndarray:
    valid = (truth < N_CLASSES) & (pred < N_CLASSES)
    return np.bincount(
        truth[valid].astype(np.int64) * N_CLASSES + pred[valid].astype(np.int64),
        minlength=N_CLASSES * N_CLASSES,
    ).reshape(N_CLASSES, N_CLASSES)


def scores(cm: np.ndarray) -> tuple[float, float, dict[int, float]]:
    ious, dscs, per_class = [], [], {}
    for c in TISSUE_CLASSES:
        tp = cm[c, c]
        fp = cm[:, c].sum() - tp
        fn = cm[c, :].sum() - tp
        if tp + fp + fn == 0:
            continue
        iou = tp / (tp + fp + fn)
        dsc = 2 * tp / (2 * tp + fp + fn)
        ious.append(iou)
        dscs.append(dsc)
        per_class[c] = iou
    return (float(np.mean(ious)) if ious else 0.0,
            float(np.mean(dscs)) if dscs else 0.0,
            per_class)


def run_experiment_a(model, slides: int, patches: int) -> None:
    print("\n" + "=" * 74)
    print("A. PANDA slides — accuracy against ground truth")
    print("=" * 74)

    files = sorted(PANDA_IMAGES.glob("*.tiff"))[:slides]
    cm_raw = np.zeros((N_CLASSES, N_CLASSES), dtype=np.int64)
    cm_norm = np.zeros((N_CLASSES, N_CLASSES), dtype=np.int64)
    cm_cond = np.zeros((N_CLASSES, N_CLASSES), dtype=np.int64)
    total_patches = normalised_by_gate = 0

    for path in files:
        mask_path = PANDA_MASKS / f"{path.stem}_mask.tiff"
        if not mask_path.exists():
            print(f"  {path.stem[:12]}: no ground-truth mask, skipped")
            continue
        bgr = cv2.imread(str(path))
        truth_full = cv2.imread(str(mask_path))[:, :, 2]  # class values live in the R channel

        coords = tissue_patch_coords(bgr, patches)
        total_patches += len(coords)
        for x, y, ew, eh in coords:
            crop = bgr[y:y + PATCH_SIZE, x:x + PATCH_SIZE]
            truth = truth_full[y:y + eh, x:x + ew]

            pred_raw = _segment_patch(model, crop)[:eh, :ew]
            cm_raw += confusion(pred_raw, truth)

            try:
                normalized = normalize_stain(crop)
            except (ValueError, np.linalg.LinAlgError):
                normalized = crop
            pred_norm = _segment_patch(model, normalized)[:eh, :ew]
            cm_norm += confusion(pred_norm, truth)

            # Third arm: what the pipeline actually does now — normalise only
            # patches the gate judges out-of-distribution. No extra inference,
            # since the gate simply picks one of the two predictions above.
            gated = needs_stain_normalization(crop)
            normalised_by_gate += int(gated)
            cm_cond += confusion(pred_norm if gated else pred_raw, truth)
        print(f"  {path.stem[:12]}: {len(coords)} patches")

    iou_raw, dsc_raw, per_raw = scores(cm_raw)
    iou_norm, dsc_norm, per_norm = scores(cm_norm)
    iou_cond, dsc_cond, per_cond = scores(cm_cond)

    print(f"\n  {total_patches} patches from {len(files)} slides")
    print(f"  gate normalised {normalised_by_gate}/{total_patches} "
          f"({normalised_by_gate / max(total_patches, 1) * 100:.1f}%) of these in-domain patches\n")
    print(f"  {'':<22} {'raw':>10} {'always':>10} {'conditional':>13}")
    print(f"  {'mean IoU (classes 2-5)':<22} {iou_raw:>10.4f} {iou_norm:>10.4f} {iou_cond:>13.4f}")
    print(f"  {'mean DSC (classes 2-5)':<22} {dsc_raw:>10.4f} {dsc_norm:>10.4f} {dsc_cond:>13.4f}")
    print("\n  per-class IoU:")
    for c in TISSUE_CLASSES:
        if c in per_raw or c in per_norm or c in per_cond:
            print(f"    {CLASS_NAMES[c]:<12} {per_raw.get(c, 0.0):>10.4f} "
                  f"{per_norm.get(c, 0.0):>10.4f} {per_cond.get(c, 0.0):>13.4f}")


def run_experiment_b(model, patches: int) -> None:
    print("\n" + "=" * 74)
    print("B. Real microscope captures — how far the prediction moves")
    print("=" * 74)
    print("  No ground truth exists for these, so this is displacement, not accuracy.")

    files = [p for p in sorted(YD_IMAGES.iterdir()) if p.suffix.lower() in (".tiff", ".tif", ".jpg", ".png")]
    if not files:
        print("  no captures found, skipped")
        return

    changed_total = compared_total = 0
    for path in files:
        bgr = cv2.imread(str(path))
        if bgr is None:
            continue
        coords = tissue_patch_coords(bgr, patches)
        changed = compared = 0
        for x, y, ew, eh in coords:
            crop = bgr[y:y + PATCH_SIZE, x:x + PATCH_SIZE]
            raw = _segment_patch(model, crop)[:eh, :ew]
            try:
                normalized = normalize_stain(crop)
            except (ValueError, np.linalg.LinAlgError):
                normalized = crop
            norm = _segment_patch(model, normalized)[:eh, :ew]
            changed += int((raw != norm).sum())
            compared += raw.size
        if compared:
            changed_total += changed
            compared_total += compared
            print(f"  {path.name[:34]:<36} {len(coords):>3} patches  {changed / compared * 100:>6.2f}% pixels reclassified")

    if compared_total:
        print(f"\n  Overall: {changed_total / compared_total * 100:.2f}% of tissue pixels change class "
              f"when normalisation is applied.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slides", type=int, default=5)
    parser.add_argument("--patches", type=int, default=40, help="patches sampled per slide")
    parser.add_argument("--arch", default=None, help="segmentation architecture (default: first available)")
    args = parser.parse_args()

    available = registry.list_available("segmentation")
    if not available:
        print("No segmentation checkpoints found.")
        return
    arch = args.arch or available[0]
    print(f"Segmentation model: {arch}")
    model = registry.load("segmentation", arch)

    run_experiment_a(model, args.slides, args.patches)
    run_experiment_b(model, args.patches)

    print("\nReminder: one architecture, a patch sample, and a single run — this "
          "sizes the effect of the normalisation step, it is not a model evaluation.")


if __name__ == "__main__":
    main()
