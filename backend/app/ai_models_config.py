"""Static metadata about the two trained models (offline metrics from the
Colab training notebooks, evaluated on SICAPv2 with 4-fold CV — see PRD §11).
There is no DB table for this: it doesn't change at runtime, only when a new
checkpoint is trained and someone updates this file.
"""
from .schemas import ModelInfo, ModelMetric

MODELS: list[ModelInfo] = [
    ModelInfo(
        name="Gland Segmentation",
        task="Binary cancer-region mask",
        encoder="ResNeXt50_32x4d",
        version="v2.4",
        trained_at="2026-07-08",
        status="active",
        metrics=[
            ModelMetric(name="IoU", value="0.842"),
            ModelMetric(name="Dice", value="0.911"),
            ModelMetric(name="Recall", value="0.897"),
        ],
    ),
    ModelInfo(
        name="Gleason Classification",
        task="Pattern 3 / 4 / 5",
        encoder="CNN classifier",
        version="v2.1",
        trained_at="2026-07-09",
        status="active",
        metrics=[
            ModelMetric(name="Accuracy", value="0.861"),
            ModelMetric(name="F1 (macro)", value="0.848"),
            ModelMetric(name="Kappa", value="n/a"),
        ],
    ),
]
