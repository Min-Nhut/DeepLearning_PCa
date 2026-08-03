"""Static metadata about the 8 candidate architectures (4 segmentation + 4
classification, see CLAUDE.md's AI models section) trained on PANDA. Only the
genuinely static fields live here (arch_key/task_type/name/task_label/encoder/
metrics) — `checkpoint_available`/`trained_at`/`status` are computed live in
`routers/admin.py` from whatever's actually in `backend/models/`, so this file
never needs hand-editing again when a new checkpoint lands.

Classification metrics are the user's real evaluation results
(classification_results.csv from their own training run, not the paper's
numbers). Segmentation metrics are empty — no checkpoint/eval data exists yet,
never fabricate placeholder numbers here.
"""
from .schemas import ModelInfo, ModelMetric

CLF_TASK_LABEL = "Phân loại Gleason Pattern (benign / G3 / G4 / G5)"
SEG_TASK_LABEL = "Phân đoạn mô 6 lớp (nền / stroma / benign / G3 / G4 / G5)"


def _clf_metrics(accuracy: float, f1_score: float, precision: float, sensitivity: float, specificity: float) -> list[ModelMetric]:
    return [
        ModelMetric(name="Accuracy", value=f"{accuracy:.4f}"),
        ModelMetric(name="F1 (macro)", value=f"{f1_score:.4f}"),
        ModelMetric(name="Precision", value=f"{precision:.4f}"),
        ModelMetric(name="Sensitivity", value=f"{sensitivity:.4f}"),
        ModelMetric(name="Specificity", value=f"{specificity:.4f}"),
    ]


MODELS: list[ModelInfo] = [
    # ---------------------------------------------------------- classification ----
    ModelInfo(
        arch_key="densenet121",
        task_type="classification",
        name="DenseNet121",
        task_label=CLF_TASK_LABEL,
        encoder="DenseNet121",
        metrics=_clf_metrics(0.8736870274971567, 0.8633592618148692, 0.8548458074943012, 0.874527926920766, 0.9548448516585678),
    ),
    ModelInfo(
        arch_key="efficientnet_b0",
        task_type="classification",
        name="EfficientNet_b0",
        task_label=CLF_TASK_LABEL,
        encoder="EfficientNet_b0",
        metrics=_clf_metrics(0.8785040476349769, 0.8684536501463842, 0.8600336073614685, 0.8789317321140229, 0.9566489689687122),
    ),
    ModelInfo(
        arch_key="inception_v3",
        task_type="classification",
        name="Inception_v3",
        task_label=CLF_TASK_LABEL,
        encoder="Inception_v3",
        metrics=_clf_metrics(0.8611056333399066, 0.8477333017547052, 0.8320755244808181, 0.8693101283144088, 0.953281535453386),
    ),
    ModelInfo(
        arch_key="vit_b_16",
        task_type="classification",
        name="ViT-B/16",
        task_label=CLF_TASK_LABEL,
        encoder="ViT-B/16",
        metrics=_clf_metrics(0.8582791033984093, 0.8362524586184927, 0.843486259938825, 0.8307771368537724, 0.9474300267998158),
    ),
    # ------------------------------------------------------------ segmentation ----
    ModelInfo(
        arch_key="unet_densenet121",
        task_type="segmentation",
        name="U-Net (DenseNet121)",
        task_label=SEG_TASK_LABEL,
        encoder="DenseNet121",
        metrics=[],
    ),
    ModelInfo(
        arch_key="unet_efficientnet_b0",
        task_type="segmentation",
        name="U-Net (EfficientNet_b0)",
        task_label=SEG_TASK_LABEL,
        encoder="EfficientNet_b0",
        metrics=[],
    ),
    ModelInfo(
        arch_key="deeplabv3_efficientnet_b0",
        task_type="segmentation",
        name="DeepLabV3 (EfficientNet_b0)",
        task_label=SEG_TASK_LABEL,
        encoder="EfficientNet_b0",
        metrics=[],
    ),
    ModelInfo(
        arch_key="deeplabv3plus_efficientnet_b0",
        task_type="segmentation",
        name="DeepLabV3+ (EfficientNet_b0)",
        task_label=SEG_TASK_LABEL,
        encoder="EfficientNet_b0",
        metrics=[],
    ),
]
