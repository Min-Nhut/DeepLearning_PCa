from sqlalchemy.orm import Session

from .models import AuditLog, User


def write_audit_log(
    db: Session,
    user: User | None,
    action: str,
    entity_type: str,
    entity_id: int | None,
    details: str | None = None,
) -> None:
    """Stages an audit_logs row on the given session — does not commit itself,
    call sites add this before their own db.commit() so the log write is
    atomic with the rest of the request."""
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
    )
