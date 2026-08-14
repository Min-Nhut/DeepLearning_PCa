"""Stage 3 — WSI-level ML fusion: takes the two classification models'
average per-class probabilities (8 values, see stage3_metadata.json's
`feature_columns`) and predicts an ISUP grade (0-5) via a pre-trained
sklearn MLPClassifier + StandardScaler. Not a PyTorch checkpoint, so this
is deliberately a separate, much simpler loader than inference/registry.py
(no architecture factory, no state_dict — just joblib.load()).

Confirmed by reading the actual artifacts directly (not the spec doc, which
described a 16-dim classification+segmentation feature vector — the real
trained model only takes 8 classification-only features):
  model.n_features_in_ == 8, scaler.n_features_in_ == 8, both matching
  stage3_metadata.json's feature_columns exactly.
"""
import json
from pathlib import Path

import joblib

FUSION_MODEL_ROOT = Path(__file__).resolve().parent.parent.parent / "models" / "machine_learning_fusion"

CLASSES = ("benign", "gleason_3", "gleason_4", "gleason_5")

_model = None
_scaler = None
_metadata: dict | None = None


class FusionNotAvailableError(Exception):
    """Raised when the Stage 3 artifacts aren't present — mirrors
    registry.ModelNotAvailableError's "fail clearly, not a crash" behavior,
    kept as a separate exception type since this isn't a PyTorch checkpoint."""


def _paths() -> tuple[Path, Path, Path]:
    return (
        FUSION_MODEL_ROOT / "stage3_final_model.joblib",
        FUSION_MODEL_ROOT / "stage3_final_scaler.joblib",
        FUSION_MODEL_ROOT / "stage3_metadata.json",
    )


def is_available() -> bool:
    return all(p.exists() for p in _paths())


def _load() -> tuple[object, object, dict]:
    global _model, _scaler, _metadata
    if _model is None:
        model_path, scaler_path, metadata_path = _paths()
        if not (model_path.exists() and scaler_path.exists() and metadata_path.exists()):
            raise FusionNotAvailableError(f"Thiếu file model Stage 3 tại {FUSION_MODEL_ROOT}")
        _model = joblib.load(model_path)
        _scaler = joblib.load(scaler_path)
        _metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    return _model, _scaler, _metadata


def predict_isup(classification_pct: dict[str, dict[str, float]]) -> tuple[int, float]:
    """`classification_pct`: {"densenet121": {"benign": .., "gleason_3": .., ...},
    "efficientnet_b0": {...}} — average per-class softmax %, as produced by
    pipeline.py's run_stage3_fusion(). Builds the 8-dim vector in the exact
    column order stage3_metadata.json's own `feature_columns` specifies
    (not assumed/hand-ordered), so a mismatch between this app's model names
    and the training metadata surfaces as a clear KeyError, not a silently
    wrong prediction."""
    model, scaler, metadata = _load()

    vector = []
    for col in metadata["feature_columns"]:
        # e.g. "clf_densenet121_gleason_3_pct" -> model_name="densenet121", cls="gleason_3".
        # Both model names and class names ("gleason_3") contain underscores, so this can't
        # just split on "_" — match against the known model names in classification_pct instead.
        body = col.removeprefix("clf_").removesuffix("_pct")
        model_name = next(m for m in classification_pct if body.startswith(m + "_"))
        cls = body[len(model_name) + 1:]
        vector.append(classification_pct[model_name][cls])

    x_scaled = scaler.transform([vector])
    isup_grade = int(model.predict(x_scaled)[0])
    proba = model.predict_proba(x_scaled)[0]
    class_index = list(model.classes_).index(isup_grade)
    confidence = float(proba[class_index])
    return isup_grade, confidence
