from pydantic import BaseModel


# ---------- stats ----------
class AdminStats(BaseModel):
    total_cases: int
    active_users: int
    avg_processing_seconds: float | None
    pipeline_error_rate: float | None  # 0..1, None if no runs yet


# ---------- users ----------
class UserOut(BaseModel):
    id: int
    username: str
    full_name: str | None
    role: str
    is_active: bool
    run_count: int
    last_activity: str | None


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str | None = None
    role: str = "user"


class UserUpdate(BaseModel):
    is_active: bool | None = None
    role: str | None = None
    full_name: str | None = None


# ---------- logs ----------
class LogOut(BaseModel):
    id: int
    created_at: str
    username: str | None
    action: str
    entity_type: str
    entity_id: int | None
    details: str | None


# ---------- models ----------
class ModelMetric(BaseModel):
    name: str
    value: str


class ModelInfo(BaseModel):
    name: str
    task: str
    encoder: str
    version: str
    trained_at: str
    status: str
    metrics: list[ModelMetric]
    checkpoint_available: bool = False


# ---------- migration ----------
class MigrationPreview(BaseModel):
    columns: list[str]
    row_count: int
    field_mapping: dict[str, str]
    unmapped_columns: list[str]


class MigrationImportResult(BaseModel):
    imported: int
    skipped: int
    skipped_reasons: list[str]
