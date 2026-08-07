from pydantic import BaseModel


class PatternCount(BaseModel):
    label: str
    pattern: int | None  # None = benign (no primary_pattern)
    count: int
    percentage: float


class DoctorStats(BaseModel):
    new_cases_today: int
    pending_reviews: int  # diagnostic_reviews.status == 'draft'
    confirmed_reviews: int  # diagnostic_reviews.status == 'confirmed'
    avg_ai_confidence: float | None  # classification_results.primary_confidence, averaged, as 0..100
    pattern_distribution: list[PatternCount]  # confirmed reviews only, grouped by primary_pattern
