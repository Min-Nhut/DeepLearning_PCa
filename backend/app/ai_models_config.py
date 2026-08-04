"""Static metadata about the 8 candidate architectures (4 segmentation + 4
classification, see CLAUDE.md's AI models section) trained on PANDA. Only the
genuinely static fields live here (arch_key/task_type/name/task_label/encoder/
metrics) — `checkpoint_available`/`trained_at`/`status` are computed live by
`list_model_infos()` below from whatever's actually in `backend/models/`, so
this file never needs hand-editing again when a new checkpoint lands.

Classification metrics are the user's real evaluation results
(classification_results.csv from their own training run, not the paper's
numbers). Segmentation metrics are the user's real results too
(segmentation_results.csv) for the 3 architectures they chose to keep — plain
DeepLabV3 (without the `+`) was trained but deliberately dropped, see
CLAUDE.md's AI models section.
"""
from datetime import datetime

from .inference import registry as model_registry
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


def _seg_metrics(accuracy: float, iou: float, dsc: float, fnr: float, fpr: float, specificity: float, fnr_gleason_5: float) -> list[ModelMetric]:
    # Overall/aggregate metrics (matches the paper's Table 6 style) plus
    # fnr_gleason_5 specifically — the miss rate on the most dangerous tissue
    # class, flagged in CLAUDE.md as the one to watch clinically. The full CSV
    # also has per-class (benign/G3/G4/G5) dsc/iou/fnr/fpr breakdowns not
    # surfaced here — 22 columns doesn't fit the compact card UI, the raw CSV
    # remains the source of truth for the thesis write-up.
    return [
        ModelMetric(name="Accuracy", value=f"{accuracy:.4f}"),
        ModelMetric(name="IoU (mean)", value=f"{iou:.4f}"),
        ModelMetric(name="DSC (mean)", value=f"{dsc:.4f}"),
        ModelMetric(name="FNR (mean)", value=f"{fnr:.4f}"),
        ModelMetric(name="FPR (mean)", value=f"{fpr:.4f}"),
        ModelMetric(name="Specificity", value=f"{specificity:.4f}"),
        ModelMetric(name="FNR Gleason 5", value=f"{fnr_gleason_5:.4f}"),
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
    # Only 3 of the 4 trained architectures are kept — plain DeepLabV3 (without
    # the `+`) was deliberately dropped by the user, confirmed 2026-08-04.
    ModelInfo(
        arch_key="unet_densenet121",
        task_type="segmentation",
        name="U-Net (DenseNet121)",
        task_label=SEG_TASK_LABEL,
        encoder="DenseNet121",
        metrics=_seg_metrics(0.8898317665669303, 0.6528394918860364, 0.7885663208807172, 0.2132123229004757, 0.0210331608821075, 0.9789668391178924, 0.2948209698736568),
    ),
    ModelInfo(
        arch_key="unet_efficientnet_b0",
        task_type="segmentation",
        name="U-Net (EfficientNet_b0)",
        task_label=SEG_TASK_LABEL,
        encoder="EfficientNet_b0",
        metrics=_seg_metrics(0.8772573257298245, 0.6192588346864358, 0.7623224548096925, 0.2239911100613973, 0.0239650482677113, 0.9760349517322888, 0.3018165075766932),
    ),
    ModelInfo(
        arch_key="deeplabv3plus_efficientnet_b0",
        task_type="segmentation",
        name="DeepLabV3+ (EfficientNet_b0)",
        task_label=SEG_TASK_LABEL,
        encoder="EfficientNet_b0",
        metrics=_seg_metrics(0.8589129828577179, 0.5928472323087242, 0.7425448089397829, 0.25212350604706635, 0.025908641910904244, 0.9740913580890957, 0.3034452367350703),
    ),
]


def list_model_infos() -> list[ModelInfo]:
    """MODELS with live `checkpoint_available`/`trained_at`/`status` filled in
    from whatever's actually on disk right now. Shared by both `GET
    /api/admin/models` (admin-only) and `GET /api/models` (any authenticated
    user — the model-selector picker on the Pipeline screen needs this too,
    and doctors aren't admins) so the two never drift apart.
    """
    out = []
    for m in MODELS:
        available = model_registry.is_available(m.task_type, m.arch_key)
        trained_at = None
        if available:
            path = model_registry.MODEL_ROOT / m.task_type / f"{m.arch_key}_best.pt"
            trained_at = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")
        out.append(m.model_copy(update={
            "checkpoint_available": available,
            "trained_at": trained_at,
            "status": "active" if available else "pending",
        }))
    return out
