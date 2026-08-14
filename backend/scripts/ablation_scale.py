"""Does correcting physical scale recover classification accuracy on a
coarser-than-training image?

Motivation (2026-08-08). A SICAPv2 patch uploaded to the app produced four
mutually exclusive verdicts from the four classification checkpoints, each above
88% confidence, and the app's headline answer was "benign" next to a mask full
of Gleason 3 and 4 glands. SICAPv2 patches are 512x512 at roughly 1.0 um/px
(10x) while training patches are 500x500 at 0.48619 um/px — about 2x coarser.
Re-classifying those 11 SICAPv2 files after correcting for that ratio flipped
the consensus from "mostly benign" to "mostly Gleason 4" and cut catastrophic
four-way disagreement from 6/11 to 0/11.

That measurement has no ground truth, so it cannot say whether the corrected
answer is *right*. This script supplies the missing control: it takes real PANDA
regions whose labels are known from the pixel masks, degrades them to imitate a
coarser acquisition, and measures accuracy with and without the scale
correction the app would apply if it knew the image's um/px.

Three conditions per region, all judged against the same ground-truth label:

  ceiling      native resolution, correct scale — four 486px quadrants, each a
               training-sized field. The best the models can do on this region.
  no_correct   what the app does today for an image of unknown resolution: the
               whole downscaled region handed over as one patch, so the model
               sees 2x more tissue than any patch it was trained on.
  corrected    what the app does once um/px is known: scale.patch_size_for()
               shrinks the grid so each patch again spans 243.1um of tissue.

`no_correct` and `corrected` both suffer the same loss of detail, so the gap
between them isolates *scale* alone. `ceiling` shows how much is lost to the
resolution drop that no amount of re-gridding can undo.

Labels follow the training rule (methodology paper, and this repo's own dataset
notes): benign requires 100% of the epithelium to be benign, and gleason_3/4/5
requires that pattern to cover at least 50% of the epithelium. A region meeting
neither threshold has no label and is skipped, exactly as during training.

Usage:  python scripts/ablation_scale.py [--regions-per-slide 12] [--arch ...]
Reads   test_image/PANDA_image_test/{train_images,train_label_masks}
Writes  nothing. Prints a table.
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.inference import registry  # noqa: E402
from app.inference.pipeline import _classify_patch_probs  # noqa: E402
from app.inference.scale import TRAINING_UM_PER_PIXEL, patch_size_for  # noqa: E402

REPO = Path(__file__).resolve().parent.parent.parent
IMAGES = REPO / "test_image" / "PANDA_image_test" / "train_images"
MASKS = REPO / "test_image" / "PANDA_image_test" / "train_label_masks"

TRAINING_PATCH_PX = 500
TRAINING_SPAN_UM = TRAINING_PATCH_PX * TRAINING_UM_PER_PIXEL  # 243.1um

CLASS_NAMES = ["benign", "gleason_3", "gleason_4", "gleason_5"]
# Mask pixel values: 0=background 1=stroma 2=benign 3=g3 4=g4 5=g5.
EPITHELIUM = (2, 3, 4, 5)
MASK_TO_CLASS = {2: 0, 3: 1, 4: 2, 5: 3}

MIN_EPITHELIUM_FRACTION = 0.10  # a region has to actually contain glands to be labelled


def label_of(mask_region: np.ndarray) -> int | None:
    """The training-time patch label, or None when the region meets no threshold."""
    epithelium = np.isin(mask_region, EPITHELIUM)
    total = int(epithelium.sum())
    if total < MIN_EPITHELIUM_FRACTION * mask_region.size:
        return None
    counts = {v: int((mask_region == v).sum()) for v in EPITHELIUM}
    if counts[2] == total:
        return 0  # every epithelial pixel benign
    for value in (3, 4, 5):
        if counts[value] >= 0.5 * total:
            return MASK_TO_CLASS[value]
    return None


def read_pair(image_id: str) -> tuple[np.ndarray, np.ndarray] | None:
    """Level 0 of the slide and the matching mask channel, or None if unreadable."""
    bgr = cv2.imread(str(IMAGES / f"{image_id}.tiff"))
    mask_bgr = cv2.imread(str(MASKS / f"{image_id}_mask.tiff"))
    if bgr is None or mask_bgr is None:
        return None
    if bgr.shape[:2] != mask_bgr.shape[:2]:
        return None
    # PANDA stores the class in the red channel; cv2 gives BGR, so index 2.
    return bgr, mask_bgr[:, :, 2]


def sample_regions(bgr, mask, region_px: int, wanted: int, rng: random.Random):
    """Labelled regions of `region_px` square, sampled from tissue areas."""
    h, w = mask.shape
    if h <= region_px or w <= region_px:
        return []
    out = []
    for _ in range(wanted * 40):
        if len(out) >= wanted:
            break
        y = rng.randrange(0, h - region_px)
        x = rng.randrange(0, w - region_px)
        m = mask[y:y + region_px, x:x + region_px]
        label = label_of(m)
        if label is None:
            continue
        out.append((bgr[y:y + region_px, x:x + region_px], label))
    return out


def to_patch(img: np.ndarray, size: int = TRAINING_PATCH_PX) -> np.ndarray:
    interp = cv2.INTER_AREA if img.shape[0] > size else cv2.INTER_LINEAR
    return cv2.resize(img, (size, size), interpolation=interp)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--regions-per-slide", type=int, default=12)
    parser.add_argument("--arch", action="append", default=None)
    parser.add_argument(
        "--coarsen", type=float, default=2.06,
        help="how much coarser the simulated acquisition is than training "
             "(2.06 = SICAPv2's ~1.0um/px against PANDA's 0.48619)",
    )
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    archs = args.arch or ["efficientnet_b0", "densenet121", "inception_v3", "vit_b_16"]
    models = {a: registry.load("classification", a) for a in archs}

    simulated_um = TRAINING_UM_PER_PIXEL * args.coarsen
    # A region holding exactly 2x2 training fields, so every condition can be
    # judged against one label. In *native* pixels that is 2 x 500, whatever the
    # coarsening factor — the factor only changes how many pixels the acquired
    # file spends on it. (Multiplying by the factor here was the first version's
    # bug: it made the "ceiling" quadrants 1030 native px, i.e. 500um each, so
    # the supposed upper bound was itself at the wrong scale and scored 19%.)
    region_px = TRAINING_PATCH_PX * 2
    file_px = int(round(region_px / args.coarsen))
    corrected_px = patch_size_for(simulated_um, TRAINING_PATCH_PX)
    quadrant_px = region_px // 2

    print(f"training      {TRAINING_UM_PER_PIXEL:.5f} um/px, {TRAINING_PATCH_PX}px patch = {TRAINING_SPAN_UM:.1f}um")
    print(f"simulated     {simulated_um:.5f} um/px  ({args.coarsen}x coarser)")
    print(f"region        {region_px}px native -> stored as {file_px}px file")
    print(f"corrected     scale.patch_size_for() -> {corrected_px}px grid on that file")
    print(f"models        {', '.join(archs)}\n")

    rng = random.Random(args.seed)
    image_ids = sorted(p.stem for p in IMAGES.glob("*.tiff"))

    # correct[cond][arch] = number right; also track the ensemble of all archs.
    conditions = ["ceiling", "no_correct", "corrected"]
    correct = {c: dict.fromkeys(archs + ["ensemble"], 0) for c in conditions}
    conf_sum = {c: 0.0 for c in conditions}
    per_class_total: dict[int, int] = {}
    per_class_correct = {c: {} for c in conditions}
    total = 0

    for image_id in image_ids:
        pair = read_pair(image_id)
        if pair is None:
            print(f"  (skipped {image_id}: unreadable or mismatched mask)")
            continue
        bgr, mask = pair
        for region, label in sample_regions(bgr, mask, region_px, args.regions_per_slide, rng):
            total += 1
            per_class_total[label] = per_class_total.get(label, 0) + 1

            stored = to_patch(region, file_px)  # the "acquired" coarser file

            inputs = {
                # Four native-resolution training-sized fields.
                "ceiling": [
                    region[qy:qy + quadrant_px, qx:qx + quadrant_px]
                    for qy in (0, quadrant_px) for qx in (0, quadrant_px)
                ],
                # Today: the whole file treated as one patch, so the model sees
                # 2x the tissue any training patch contained.
                "no_correct": [stored],
                # With um/px known: a grid whose cells each span 243.1um again.
                "corrected": [
                    stored[gy:gy + corrected_px, gx:gx + corrected_px]
                    for gy in (0, file_px - corrected_px)
                    for gx in (0, file_px - corrected_px)
                ],
            }

            for cond, crops in inputs.items():
                per_arch = {}
                for arch, model in models.items():
                    probs = np.mean([_classify_patch_probs(model, to_patch(c)) for c in crops], axis=0)
                    per_arch[arch] = probs
                    if int(np.argmax(probs)) == label:
                        correct[cond][arch] += 1
                ens = np.mean(list(per_arch.values()), axis=0)
                conf_sum[cond] += float(ens.max())
                if int(np.argmax(ens)) == label:
                    correct[cond]["ensemble"] += 1
                    per_class_correct[cond][label] = per_class_correct[cond].get(label, 0) + 1

    if total == 0:
        print("No labelled regions found — nothing to report.")
        return

    print(f"\n{total} labelled regions from {len(image_ids)} slides")
    print("label distribution: " + ", ".join(
        f"{CLASS_NAMES[k]}={v}" for k, v in sorted(per_class_total.items())) + "\n")

    header = f"{'condition':<12}" + "".join(f"{a[:14]:>16s}" for a in archs) + f"{'ensemble':>11s}{'ens.conf':>10s}"
    print(header)
    print("-" * len(header))
    for cond in conditions:
        row = f"{cond:<12}"
        for arch in archs:
            row += f"{correct[cond][arch] / total * 100:>15.1f}%"
        row += f"{correct[cond]['ensemble'] / total * 100:>10.1f}%"
        row += f"{conf_sum[cond] / total * 100:>9.1f}%"
        print(row)

    print("\nensemble accuracy per class")
    for k in sorted(per_class_total):
        line = f"  {CLASS_NAMES[k]:<10} n={per_class_total[k]:<5d}"
        for cond in conditions:
            line += f"  {cond}={per_class_correct[cond].get(k, 0) / per_class_total[k] * 100:5.1f}%"
        print(line)


if __name__ == "__main__":
    main()
