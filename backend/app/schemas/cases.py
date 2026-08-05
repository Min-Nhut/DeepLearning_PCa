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


# ---------- preprocessing ----------
class PreprocessingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    image_id: int
    is_blurry: bool
    quality_score: float | None
    has_normalized_image: bool
    has_tissue_mask: bool
    processed_at: str
