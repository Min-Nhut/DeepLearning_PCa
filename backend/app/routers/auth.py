import threading
import time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import LoginRequest, LoginResponse, MeResponse
from ..security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Simple in-memory login lockout — there was no brute-force protection at all
# before this. Keyed by username rather than IP: this app protects a small,
# fixed set of known accounts (not a public signup system), so a per-account
# lockout is both simpler (no proxy/X-Forwarded-For trust question) and more
# directly protects what actually matters here. Single-process only (an
# in-memory dict) — matches how this app is actually run today (no
# --workers flag); a multi-worker deployment would need a shared store
# (e.g. Redis) instead.
_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_WINDOW_SECONDS = 15 * 60
_failed_attempts: dict[str, list[float]] = {}
_failed_attempts_lock = threading.Lock()


def _recent_failures(username: str, now: float) -> list[float]:
    return [t for t in _failed_attempts.get(username, []) if now - t < _LOCKOUT_WINDOW_SECONDS]


def _is_locked_out(username: str) -> bool:
    now = time.time()
    with _failed_attempts_lock:
        recent = _recent_failures(username, now)
        _failed_attempts[username] = recent
        return len(recent) >= _MAX_FAILED_ATTEMPTS


def _record_failure(username: str) -> None:
    now = time.time()
    with _failed_attempts_lock:
        recent = _recent_failures(username, now)
        recent.append(now)
        _failed_attempts[username] = recent


def _clear_failures(username: str) -> None:
    with _failed_attempts_lock:
        _failed_attempts.pop(username, None)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    if _is_locked_out(payload.username):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Đã sai quá {_MAX_FAILED_ATTEMPTS} lần — thử lại sau 15 phút",
        )

    user = db.query(User).filter(User.username == payload.username).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        _record_failure(payload.username)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sai tên đăng nhập hoặc mật khẩu")
    if not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản đã bị khóa")

    _clear_failures(payload.username)
    token = create_access_token(user_id=user.id, username=user.username, role=user.role)
    return LoginResponse(access_token=token)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)) -> User:
    return user
