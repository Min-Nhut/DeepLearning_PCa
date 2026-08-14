"""SQLAlchemy ORM models mirroring docs/schema.sql exactly (same table/column
names). The database file already exists (see database/init_db.sh) — these
models are for querying/writing, not for `create_all`.
"""
from __future__ import annotations

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('user','admin')"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default="user")
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class Case(Base):
    __tablename__ = "cases"
    __table_args__ = (
        CheckConstraint("source IN ('new','legacy_import')"),
        UniqueConstraint("case_code", "case_year", name="idx_cases_code_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_code: Mapped[str] = mapped_column(Text, nullable=False)
    case_year: Mapped[str | None] = mapped_column(Text)
    patient_name: Mapped[str | None] = mapped_column(Text)
    patient_age: Mapped[int | None] = mapped_column(Integer)
    conclusion: Mapped[str | None] = mapped_column(Text)
    is_anonymized: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="new")
    legacy_case_id: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))

    # Ordered explicitly: without this SQLite returns whatever physical order it
    # likes, which is not even stable across UPDATEs — so the slide reorder
    # feature (POST /api/cases/slides/{id}/move) would have had no visible
    # effect, or a random one. Caught by tests/test_slide_management.py.
    slides: Mapped[list["Slide"]] = relationship(
        back_populates="case", cascade="all, delete-orphan", order_by="Slide.slide_number",
    )


class Slide(Base):
    __tablename__ = "slides"
    __table_args__ = (UniqueConstraint("case_id", "slide_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    slide_number: Mapped[int] = mapped_column(Integer, nullable=False)
    legacy_slide_label: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))

    case: Mapped[Case] = relationship(back_populates="slides")
    images: Mapped[list["Image"]] = relationship(
        back_populates="slide", cascade="all, delete-orphan", order_by="Image.image_number",
    )


class Image(Base):
    __tablename__ = "images"
    __table_args__ = (
        CheckConstraint("source IN ('upload','live_capture','legacy_import')"),
        UniqueConstraint("slide_id", "image_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slide_id: Mapped[int] = mapped_column(ForeignKey("slides.id", ondelete="CASCADE"), nullable=False)
    image_number: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    width_px: Mapped[int | None] = mapped_column(Integer)
    height_px: Mapped[int | None] = mapped_column(Integer)
    format: Mapped[str | None] = mapped_column(Text)
    captured_at: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="upload")
    legacy_image_id: Mapped[str | None] = mapped_column(Text)
    magnification: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))

    slide: Mapped[Slide] = relationship(back_populates="images")


class PreprocessingResult(Base):
    __tablename__ = "preprocessing_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), nullable=False, unique=True)
    normalized_image_path: Mapped[str | None] = mapped_column(Text)
    tissue_mask_path: Mapped[str | None] = mapped_column(Text)
    is_blurry: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    quality_score: Mapped[float | None] = mapped_column()
    processed_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class InferenceRun(Base):
    __tablename__ = "inference_runs"
    __table_args__ = (CheckConstraint("status IN ('pending','running','completed','failed')"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    segmentation_model_version: Mapped[str | None] = mapped_column(Text)
    classification_model_version: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    triggered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class SegmentationResult(Base):
    __tablename__ = "segmentation_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("inference_runs.id", ondelete="CASCADE"), nullable=False, unique=True)
    mask_file_path: Mapped[str] = mapped_column(Text, nullable=False)
    cancer_area_px: Mapped[int | None] = mapped_column(Integer)
    total_tissue_area_px: Mapped[int | None] = mapped_column(Integer)
    cancer_area_percentage: Mapped[float | None] = mapped_column()
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class ClassificationResult(Base):
    __tablename__ = "classification_results"
    __table_args__ = (
        CheckConstraint("primary_pattern IN (3,4,5)"),
        CheckConstraint("secondary_pattern IN (3,4,5)"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("inference_runs.id", ondelete="CASCADE"), nullable=False, unique=True)
    primary_pattern: Mapped[int | None] = mapped_column(Integer)
    primary_confidence: Mapped[float | None] = mapped_column()
    secondary_pattern: Mapped[int | None] = mapped_column(Integer)
    secondary_confidence: Mapped[float | None] = mapped_column()
    heatmap_file_path: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class DiagnosticReview(Base):
    __tablename__ = "diagnostic_reviews"
    __table_args__ = (
        CheckConstraint("primary_pattern IN (3,4,5)"),
        CheckConstraint("secondary_pattern IN (3,4,5)"),
        CheckConstraint("grade_group BETWEEN 1 AND 5"),
        CheckConstraint("status IN ('draft','confirmed')"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    run_id: Mapped[int | None] = mapped_column(ForeignKey("inference_runs.id"))
    primary_pattern: Mapped[int | None] = mapped_column(Integer)
    secondary_pattern: Mapped[int | None] = mapped_column(Integer)
    total_score: Mapped[int | None] = mapped_column(Integer)
    grade_group: Mapped[int | None] = mapped_column(Integer)
    cancer_area_percentage: Mapped[float | None] = mapped_column()
    biopsy_location: Mapped[str | None] = mapped_column(Text)
    pni_present: Mapped[int] = mapped_column(Integer, server_default="0")
    pni_notes: Mapped[str | None] = mapped_column(Text)
    lvi_present: Mapped[int] = mapped_column(Integer, server_default="0")
    lvi_notes: Mapped[str | None] = mapped_column(Text)
    free_notes: Mapped[str | None] = mapped_column(Text)
    tumor_length_mm: Mapped[float | None] = mapped_column()
    needs_second_opinion: Mapped[int] = mapped_column(Integer, server_default="0")
    second_opinion_notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="draft")
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))

    reviewer: Mapped["User | None"] = relationship(lazy="joined")

    @property
    def reviewed_by_name(self) -> str | None:
        """Who signed this off, by name. `reviewed_by` alone is an integer, so a
        report could state a time but never a person — which is thin for
        something framed as a signed diagnosis. Read through `from_attributes`,
        so every endpoint returning a review gets it without router changes."""
        if self.reviewer is None:
            return None
        return self.reviewer.full_name or self.reviewer.username


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    generated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    generated_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class ManualAnnotation(Base):
    __tablename__ = "manual_annotations"
    __table_args__ = (CheckConstraint("gleason_pattern IN (3,4,5)"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    points: Mapped[str] = mapped_column(Text, nullable=False)
    gleason_pattern: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class MagnificationCalibration(Base):
    __tablename__ = "magnification_calibration"
    __table_args__ = (CheckConstraint("magnification IN ('4x','10x','20x','40x')"),)

    magnification: Mapped[str] = mapped_column(Text, primary_key=True)
    um_per_pixel: Mapped[float] = mapped_column(nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))


class Stage3Result(Base):
    __tablename__ = "stage3_results"
    __table_args__ = (CheckConstraint("isup_grade BETWEEN 0 AND 5"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("inference_runs.id", ondelete="CASCADE"), nullable=False, unique=True)
    isup_grade: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[float | None] = mapped_column()
    classification_pct_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("(datetime('now'))"))
