from pydantic import BaseModel


class InferenceTriggerRequest(BaseModel):
    segmentation_model: str | None = None
    classification_model: str | None = None


class SegmentationResultOut(BaseModel):
    id: int
    run_id: int
    cancer_area_px: int | None
    total_tissue_area_px: int | None
    cancer_area_percentage: float | None
    has_mask: bool
    created_at: str


class ClassificationResultOut(BaseModel):
    id: int
    run_id: int
    primary_pattern: int | None
    primary_confidence: float | None
    secondary_pattern: int | None
    secondary_confidence: float | None
    created_at: str


class InferenceRunOut(BaseModel):
    id: int
    image_id: int
    status: str
    segmentation_model_version: str | None
    classification_model_version: str | None
    error_message: str | None
    triggered_by: int | None
    started_at: str | None
    completed_at: str | None
    created_at: str
    segmentation: SegmentationResultOut | None = None
    classification: ClassificationResultOut | None = None
