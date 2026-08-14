#!/usr/bin/env python
"""Does averaging the three segmentation models beat using one of them?

Three trained checkpoints exist (U-Net/DenseNet121, U-Net/EfficientNet_b0,
DeepLabV3+/EfficientNet_b0) but a run only ever uses one. Ensembling costs no
retraining — the checkpoints are already on disk — and is usually most valuable
exactly where this system is weakest: out-of-distribution input, where different
architectures tend to fail differently.

"Usually" is not evidence, so this measures it against ground truth before
anything is wired into the pipeline. Metrics follow the training notebooks: mean
IoU and mean DSC over tissue classes 2-5, from a confusion matrix accumulated
over all patches.

Usage:
    python scripts/ablation_ensemble.py --slides 5 --patches 30
"""
import argparse
import os
import sys
import time
import warnings
from pathlib import Path

import cv2
import numpy as np
import torch

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.inference import registry  # noqa: E402
from app.inference.pipeline import SEG_INPUT_SIZE, _to_tensor  # noqa: E402
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

TISSUE_CLASSES = (2, 3, 4, 5)
CLASS_NAMES = {2: "benign", 3: "gleason_3", 4: "gleason_4", 5: "gleason_5"}
N_CLASSES = 6


def segment_probs(model, patch_bgr: np.ndarray) -> np.ndarray:
    """Class probabilities rather than the argmax — averaging has to happen on
    the probabilities, or the vote throws away exactly the confidence that makes
    an ensemble worth having."""
    rgb = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2RGB)
    with torch.no_grad():
        logits = model(_to_tensor(rgb, SEG_INPUT_SIZE))
    return torch.softmax(logits, dim=1).squeeze(0).numpy()


def to_mask(probs: np.ndarray, height: int, width: int) -> np.ndarray:
    pred = probs.argmax(axis=0).astype(np.uint8)
    if pred.shape != (height, width):
        pred = cv2.resize(pred, (width, height), interpolation=cv2.INTER_NEAREST)
    return pred


def tissue_patch_coords(bgr: np.ndarray, limit: int):
    threshold = _global_tissue_threshold(bgr)
    h, w = bgr.shape[:2]
    ys, xs = _grid_starts(h, PATCH_SIZE), _grid_starts(w, PATCH_SIZE)
    y_ext, x_ext = _exclusive_extents(ys, h, PATCH_SIZE), _exclusive_extents(xs, w, PATCH_SIZE)
    coords = []
    for y, eh in zip(ys, y_ext):
        for x, ew in zip(xs, x_ext):
            owned = bgr[y:y + eh, x:x + ew]
            sat = cv2.cvtColor(owned, cv2.COLOR_BGR2HSV)[:, :, 1]
            if cv2.morphologyEx((sat >= threshold).astype(np.uint8), cv2.MORPH_OPEN, _TISSUE_OPEN_KERNEL).any():
                coords.append((x, y, ew, eh))
    if len(coords) <= limit:
        return coords
    step = len(coords) / limit
    return [coords[int(i * step)] for i in range(limit)]


def confusion(pred: np.ndarray, truth: np.ndarray) -> np.ndarray:
    valid = (truth < N_CLASSES) & (pred < N_CLASSES)
    return np.bincount(
        truth[valid].astype(np.int64) * N_CLASSES + pred[valid].astype(np.int64),
        minlength=N_CLASSES * N_CLASSES,
    ).reshape(N_CLASSES, N_CLASSES)


def scores(cm: np.ndarray):
    ious, dscs, per_class = [], [], {}
    for c in TISSUE_CLASSES:
        tp = cm[c, c]
        fp = cm[:, c].sum() - tp
        fn = cm[c, :].sum() - tp
        if tp + fp + fn == 0:
            continue
        ious.append(tp / (tp + fp + fn))
        dscs.append(2 * tp / (2 * tp + fp + fn))
        per_class[c] = tp / (tp + fp + fn)
    return (float(np.mean(ious)) if ious else 0.0,
            float(np.mean(dscs)) if dscs else 0.0,
            per_class)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slides", type=int, default=5)
    parser.add_argument("--patches", type=int, default=30)
    args = parser.parse_args()

    architectures = registry.list_available("segmentation")
    if len(architectures) < 2:
        print("Need at least two segmentation checkpoints to compare.")
        return
    print(f"Architectures: {', '.join(architectures)}")
    models = {arch: registry.load("segmentation", arch) for arch in architectures}

    # Every subset of two or more, plus a quality-weighted average, all scored
    # from the SAME forward passes — the models run once per patch regardless,
    # so comparing combinations costs nothing extra.
    from itertools import combinations
    subsets = [c for n in range(2, len(architectures) + 1) for c in combinations(architectures, n)]
    # Short but still UNIQUE labels. Abbreviating to the family name collided —
    # two U-Nets both shortened to "unet", so one pair silently overwrote
    # another in this dict and never got evaluated.
    short = {arch: f"{i}:{arch.split('_')[0][:8]}" for i, arch in enumerate(architectures, 1)}
    combos = {f"ens[{'+'.join(short[a] for a in s)}]": s for s in subsets}
    combos["ens[weighted-by-IoU]"] = tuple(architectures)

    conditions = list(architectures) + list(combos)
    cms = {name: np.zeros((N_CLASSES, N_CLASSES), dtype=np.int64) for name in conditions}
    elapsed = {name: 0.0 for name in conditions}
    total = 0
    # Weights come from the per-architecture scores measured in the same run, so
    # they are not hand-tuned — filled in after a first pass over the data.
    weights = {arch: 1.0 for arch in architectures}
    probs_cache: list[tuple[dict, np.ndarray, int, int]] = []

    for path in sorted(PANDA_IMAGES.glob("*.tiff"))[:args.slides]:
        mask_path = PANDA_MASKS / f"{path.stem}_mask.tiff"
        if not mask_path.exists():
            continue
        bgr = cv2.imread(str(path))
        truth_full = cv2.imread(str(mask_path))[:, :, 2]
        coords = tissue_patch_coords(bgr, args.patches)
        total += len(coords)

        for x, y, ew, eh in coords:
            crop = bgr[y:y + PATCH_SIZE, x:x + PATCH_SIZE]
            # Same input the real pipeline would build, gate included, so the
            # comparison reflects deployment rather than a laboratory variant.
            if needs_stain_normalization(crop):
                try:
                    crop = normalize_stain(crop)
                except (ValueError, np.linalg.LinAlgError):
                    pass
            truth = truth_full[y:y + eh, x:x + ew]

            per_arch = {}
            for arch, model in models.items():
                started = time.perf_counter()
                probs = segment_probs(model, crop)
                elapsed[arch] += time.perf_counter() - started
                per_arch[arch] = probs
                cms[arch] += confusion(to_mask(probs, eh, ew), truth)
            probs_cache.append((per_arch, truth, eh, ew))
        print(f"  {path.stem[:12]}: {len(coords)} patches")

    # Weights derived from each model's own measured IoU on this same data, so
    # a weak member cannot drag a strong one down as hard as a plain mean does.
    for arch in architectures:
        weights[arch] = max(scores(cms[arch])[0], 1e-6)

    for per_arch, truth, eh, ew in probs_cache:
        for name, members in combos.items():
            if name == "ens[weighted-by-IoU]":
                total_w = sum(weights[a] for a in members)
                merged = sum(per_arch[a] * weights[a] for a in members) / total_w
            else:
                merged = np.mean([per_arch[a] for a in members], axis=0)
            cms[name] += confusion(to_mask(merged, eh, ew), truth)

    print(f"\n{total} patches from {args.slides} slides\n")
    header = f"{'condition':<34}{'mean IoU':>10}{'mean DSC':>10}{'vs best single':>16}"
    print(header)
    print("-" * len(header))

    results = {name: scores(cms[name]) for name in conditions}
    best_single = max(architectures, key=lambda a: results[a][0])

    for name in conditions:
        iou, dsc, _ = results[name]
        delta = "" if name in architectures else f"{iou - results[best_single][0]:+16.4f}"
        marker = "  <- best single" if name == best_single else ""
        print(f"{name:<34}{iou:>10.4f}{dsc:>10.4f}{delta}{marker}")

    print("\nper-class IoU:")
    print(f"  {'class':<12}" + "".join(f"{n[:16]:>18}" for n in conditions))
    for c in TISSUE_CLASSES:
        row = "".join(f"{results[n][2].get(c, 0.0):>18.4f}" for n in conditions)
        print(f"  {CLASS_NAMES[c]:<12}{row}")

    print("\ncost: ensembling runs every model, so inference time is the sum "
          f"({sum(elapsed[a] for a in architectures):.1f}s here vs "
          f"{elapsed[best_single]:.1f}s for the best single model).")
    print("\nOne patch sample, one run, in-domain data — this says whether the "
          "ensemble helps at all, not by how much it would help on microscope captures.")


if __name__ == "__main__":
    main()
