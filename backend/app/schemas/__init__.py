"""Split from a single schemas.py (grown to cover 6 unrelated domains) into one
module per domain. This __init__ re-exports everything so every existing
`from ..schemas import X` across routers/*.py keeps working unchanged.
"""
from .admin import (
    AdminStats,
    LogOut,
    MigrationImportResult,
    MigrationPreview,
    ModelInfo,
    ModelMetric,
    UserCreate,
    UserOut,
    UserUpdate,
)
from .annotations import AnnotationCreate, AnnotationOut, AnnotationUpdate, Point
from .auth import LoginRequest, LoginResponse, MeResponse
from .cases import (
    CaseCreate,
    CaseOut,
    CaseUpdate,
    ImageOut,
    PreprocessingOut,
    SlideCreate,
    SlideOut,
)
from .inference import (
    ClassificationResultOut,
    InferenceRunOut,
    InferenceTriggerRequest,
    SegmentationResultOut,
)
from .reviews import DiagnosticReviewOut, DiagnosticReviewUpdate

__all__ = [
    "AdminStats",
    "LogOut",
    "MigrationImportResult",
    "MigrationPreview",
    "ModelInfo",
    "ModelMetric",
    "UserCreate",
    "UserOut",
    "UserUpdate",
    "AnnotationCreate",
    "AnnotationOut",
    "AnnotationUpdate",
    "Point",
    "LoginRequest",
    "LoginResponse",
    "MeResponse",
    "CaseCreate",
    "CaseOut",
    "CaseUpdate",
    "ImageOut",
    "PreprocessingOut",
    "SlideCreate",
    "SlideOut",
    "ClassificationResultOut",
    "InferenceRunOut",
    "InferenceTriggerRequest",
    "SegmentationResultOut",
    "DiagnosticReviewOut",
    "DiagnosticReviewUpdate",
]
