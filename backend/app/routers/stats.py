from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Case, ClassificationResult, DiagnosticReview
from ..schemas import DoctorStats, PatternCount

router = APIRouter(prefix="/api/stats", tags=["stats"], dependencies=[Depends(get_current_user)])

_PATTERN_LABELS: list[tuple[int | None, str]] = [
    (None, "Lành tính"),
    (3, "Pattern 3"),
    (4, "Pattern 4"),
    (5, "Pattern 5"),
]


def _local_day_start_utc() -> str:
    """Midnight of the viewer's own day, expressed in the timezone the database
    actually stores.

    `created_at` is written by SQLite's `datetime('now')`, which is **UTC**,
    while this used to compare against Python's `date.today()`, which is
    **local**. In Vietnam (UTC+7) the two disagree from 00:00 to 07:00 every
    day, so "Ca mới hôm nay" silently read 0 for the first seven hours of every
    morning — invisible to anyone testing during the day. Caught only because a
    test happened to run at 00:38.

    Both bounds now come from one clock. The window is the doctor's local day,
    not the UTC day, because that is the day they mean.
    """
    local_midnight = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


@router.get("/doctor", response_model=DoctorStats)
def get_doctor_stats(db: Session = Depends(get_db)) -> DoctorStats:
    new_cases_today = (
        db.query(func.count(Case.id)).filter(Case.created_at >= _local_day_start_utc()).scalar() or 0
    )
    pending_reviews = (
        db.query(func.count(DiagnosticReview.id)).filter(DiagnosticReview.status == "draft").scalar() or 0
    )
    confirmed_reviews = (
        db.query(func.count(DiagnosticReview.id)).filter(DiagnosticReview.status == "confirmed").scalar() or 0
    )
    avg_confidence = (
        db.query(func.avg(ClassificationResult.primary_confidence))
        .filter(ClassificationResult.primary_confidence.isnot(None))
        .scalar()
    )

    # Distribution is scoped to confirmed reviews only — a draft's
    # primary_pattern may still be mid-edit and isn't a finalized diagnosis yet.
    pattern_rows = (
        db.query(DiagnosticReview.primary_pattern, func.count(DiagnosticReview.id))
        .filter(DiagnosticReview.status == "confirmed")
        .group_by(DiagnosticReview.primary_pattern)
        .all()
    )
    counts: dict[int | None, int] = {None: 0, 3: 0, 4: 0, 5: 0}
    for pattern, count in pattern_rows:
        counts[pattern if pattern in (3, 4, 5) else None] = counts.get(pattern if pattern in (3, 4, 5) else None, 0) + count
    total = sum(counts.values())

    distribution = [
        PatternCount(
            label=label,
            pattern=pattern,
            count=counts[pattern],
            percentage=(counts[pattern] / total * 100) if total else 0.0,
        )
        for pattern, label in _PATTERN_LABELS
    ]

    return DoctorStats(
        new_cases_today=new_cases_today,
        pending_reviews=pending_reviews,
        confirmed_reviews=confirmed_reviews,
        avg_ai_confidence=(avg_confidence * 100) if avg_confidence is not None else None,
        pattern_distribution=distribution,
    )
