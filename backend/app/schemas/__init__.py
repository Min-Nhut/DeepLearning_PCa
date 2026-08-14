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
    SqliteCasePreview,
    SqliteMigrationImportResult,
    SqliteMigrationPreview,
    UserCreate,
    UserOut,
    UserUpdate,
)
from .annotations import AnnotationCreate, AnnotationOut, AnnotationUpdate, Point
from .auth import LoginRequest, LoginResponse, MeResponse
from .calibration import CalibrationOut, CalibrationUpdate
from .cases import (
    CaseCreate,
    CaseGleasonOut,
    CaseOut,
    CaseUpdate,
    ImageOut,
    PreprocessingOut,
    SlideCreate,
    SlideMove,
    SlideOut,
)
from .inference import (
    ClassificationResultOut,
    InferenceRunOut,
    InferenceTriggerRequest,
    SegmentationResultOut,
    Stage3ResultOut,
)
from .reviews import (
    CaseReportImage,
    CaseReportOut,
    DiagnosticReviewOut,
    DiagnosticReviewUpdate,
    FlaggedReviewOut,
)
from .stats import DoctorStats, PatternCount

__all__ = [
    "AdminStats",
    "LogOut",
    "MigrationImportResult",
    "MigrationPreview",
    "ModelInfo",
    "ModelMetric",
    "SqliteCasePreview",
    "SqliteMigrationImportResult",
    "SqliteMigrationPreview",
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
    "CalibrationOut",
    "CalibrationUpdate",
    "CaseCreate",
    "CaseGleasonOut",
    "CaseOut",
    "CaseUpdate",
    "ImageOut",
    "PreprocessingOut",
    "SlideCreate",
    "SlideMove",
    "SlideOut",
    "ClassificationResultOut",
    "InferenceRunOut",
    "InferenceTriggerRequest",
    "SegmentationResultOut",
    "Stage3ResultOut",
    "DiagnosticReviewOut",
    "DiagnosticReviewUpdate",
    "CaseReportImage",
    "CaseReportOut",
    "FlaggedReviewOut",
    "DoctorStats",
    "PatternCount",
]
