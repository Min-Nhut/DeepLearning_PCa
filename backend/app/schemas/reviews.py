from typing import Literal

from pydantic import BaseModel, ConfigDict


class DiagnosticReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_id: int
    run_id: int | None
    primary_pattern: int | None
    secondary_pattern: int | None
    total_score: int | None
    grade_group: int | None
    cancer_area_percentage: float | None
    biopsy_location: str | None
    pni_present: bool
    pni_notes: str | None
    lvi_present: bool
    lvi_notes: str | None
    free_notes: str | None
    tumor_length_mm: float | None
    needs_second_opinion: bool
    second_opinion_notes: str | None
    status: str
    reviewed_by: int | None
    confirmed_at: str | None
    created_at: str
    updated_at: str


class DiagnosticReviewUpdate(BaseModel):
    primary_pattern: Literal[3, 4, 5] | None = None
    secondary_pattern: Literal[3, 4, 5] | None = None
    biopsy_location: str | None = None
    pni_present: bool | None = None
    pni_notes: str | None = None
    lvi_present: bool | None = None
    lvi_notes: str | None = None
    free_notes: str | None = None
    tumor_length_mm: float | None = None
    needs_second_opinion: bool | None = None
    second_opinion_notes: str | None = None
    cancer_area_percentage: float | None = None


class FlaggedReviewOut(BaseModel):
    review_id: int
    image_id: int
    case_id: int
    case_label: str
    slide_label: str
    second_opinion_notes: str | None
    created_at: str
