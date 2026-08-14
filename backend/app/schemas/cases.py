from typing import Literal

from pydantic import BaseModel, ConfigDict

Magnification = Literal["4x", "10x", "20x", "40x"]


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slide_id: int
    image_number: int
    description: str | None
    width_px: int | None
    height_px: int | None
    format: str | None
    source: str
    magnification: Magnification | None
    created_at: str


class SlideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: int
    slide_number: int
    legacy_slide_label: str | None
    images: list[ImageOut] = []


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_code: str
    case_year: str | None
    patient_name: str | None
    patient_age: int | None
    conclusion: str | None
    is_anonymized: bool
    source: str
    created_at: str
    updated_at: str
    # Everything below is computed per request from runs, reviews and results
    # (see routers/cases.py's _attach_derived) — none of it is a stored column,
    # and none of it can be derived from `slides` alone, which is why the
    # frontend used to hard-code it.
    status: Literal["new", "processing", "review", "reviewed"] = "new"
    # Case-level Gleason across the confirmed reviews, same rule as
    # GET /{id}/gleason. `images_confirmed` distinguishes "nothing signed off
    # yet" from "signed off and benign" — both leave the score null.
    primary_pattern: int | None = None
    secondary_pattern: int | None = None
    total_score: int | None = None
    images_confirmed: int = 0
    # The AI's confidence, 0-100, averaged over the latest completed run per
    # image. The doctor's own conclusion carries no confidence number — this is
    # the model's, and the UI must label it as such.
    ai_confidence: float | None = None
    # Case-level ISUP grade from Stage 3 ML fusion — averaged across the
    # latest completed run per image in the case. Separate from the
    # primary/secondary Gleason fields above: those come from doctor-confirmed
    # diagnostic_reviews (requiring human sign-off); this comes directly from
    # the AI pipeline and is available as soon as a run completes, no review
    # needed. None when no Stage 3 result exists for any image in the case.
    isup_grade: int | None = None
    isup_confidence: float | None = None
    slides: list[SlideOut] = []


class CaseCreate(BaseModel):
    case_code: str
    case_year: str | None = None
    patient_name: str | None = None
    patient_age: int | None = None
    conclusion: str | None = None


class CaseUpdate(BaseModel):
    case_code: str | None = None
    case_year: str | None = None
    patient_name: str | None = None
    patient_age: int | None = None
    conclusion: str | None = None


class SlideCreate(BaseModel):
    legacy_slide_label: str | None = None


class SlideMove(BaseModel):
    direction: Literal["up", "down"]


# ---------- preprocessing ----------
class PreprocessingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    image_id: int
    is_blurry: bool
    quality_score: float | None
    has_normalized_image: bool
    has_tissue_mask: bool
    processed_at: str


# ---------- case-level Gleason aggregation ----------
class CaseGleasonPerImage(BaseModel):
    image_id: int
    primary_pattern: int | None
    secondary_pattern: int | None
    cancer_area_percentage: float | None


class CaseGleasonOut(BaseModel):
    case_id: int
    primary_pattern: int | None
    secondary_pattern: int | None
    total_score: int | None
    grade_group: int | None
    images_confirmed: int
    images_total: int
    per_image: list[CaseGleasonPerImage]
