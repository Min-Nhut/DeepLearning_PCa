"""Physical scale (µm/pixel) of an image, so patches cover the same real area
the models were trained on.

The training patches are 500x500 px read at PANDA level 0, whose true resolution
was measured from the TIFF resolution tags of all 35 sample WSIs — identical in
every one of them (see TRAINING_UM_PER_PIXEL). So one training patch spans
500 * 0.48619 = 243.1 µm of tissue. Anything fed to the models should span the
same 243.1 µm, otherwise the gland structures are the wrong apparent size no
matter how good the model is.

Without this, tiling cut a flat 500x500 px regardless of the image's real
resolution: correct by construction for PANDA files (same source), arbitrary for
a microscope capture, where µm/pixel depends on the objective, the camera's
sensor pitch and the C-mount adapter.

Resolution is resolved in this order, most trustworthy first:
  1. the image file's own resolution metadata (PANDA TIFFs carry it);
  2. the admin's stage-micrometer calibration for the magnification recorded on
     the image (`magnification_calibration`);
  3. nothing — in which case NO rescaling happens and behaviour is exactly as
     before. Never guessed.
"""
import logging

from PIL import Image as PILImage

logger = logging.getLogger(__name__)

# Measured 2026-08-07 from XResolution/ResolutionUnit on all 35 PANDA sample
# WSIs: 20568.19 px/cm => 10000/20568.19 µm/px, identical in every file.
TRAINING_UM_PER_PIXEL = 0.48619

# Below this relative difference the rescale is a no-op not worth the
# interpolation loss (a PANDA file resolves to exactly the training value, and
# floating-point noise should not trigger a resample).
_RESCALE_TOLERANCE = 0.02

_TIFF_X_RESOLUTION = 282
_TIFF_RESOLUTION_UNIT = 296
_UNIT_TO_UM = {2: 25400.0, 3: 10000.0}  # 2 = inch, 3 = centimetre


def read_file_um_per_pixel(path) -> float | None:
    """µm/pixel from the image file's own resolution tags, or None if it has
    none (JPEG/PNG captures usually don't, and a camera's stated DPI would be
    about print size, not optical scale — so a missing tag must fall through to
    calibration rather than being invented)."""
    try:
        with PILImage.open(path) as im:
            tags = getattr(im, "tag_v2", None)
            if not tags or _TIFF_X_RESOLUTION not in tags:
                return None
            per_unit = float(tags[_TIFF_X_RESOLUTION])
            unit_um = _UNIT_TO_UM.get(int(tags.get(_TIFF_RESOLUTION_UNIT, 2)))
            if not per_unit or unit_um is None:
                return None
            return unit_um / per_unit
    except Exception:
        logger.exception("could not read resolution metadata from %s", path)
        return None


def patch_size_for(um_per_pixel: float | None, training_patch_px: int) -> int:
    """Native-pixel patch size covering the same tissue area as one training
    patch. Finer capture (smaller µm/px) => a physically larger crop, which the
    models then downscale to 224/256 exactly as they do for a 500px patch."""
    if not um_per_pixel or um_per_pixel <= 0:
        return training_patch_px
    ratio = TRAINING_UM_PER_PIXEL / um_per_pixel
    if abs(ratio - 1.0) <= _RESCALE_TOLERANCE:
        return training_patch_px
    return max(1, round(training_patch_px * ratio))
