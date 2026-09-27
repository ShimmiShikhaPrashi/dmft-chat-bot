"""Admin authentication: bcrypt passwords and server-side sessions.

The cookie is an HTTP-only, SameSite=Strict signed token that names a row in admin_sessions.
Signing out (or deactivating the user) revokes the row, so a copied cookie stops working.
"""

import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import AdminSession, AdminUser, AuditLog

COOKIE_NAME = "dmft_admin"
ALGORITHM = "HS256"
# Extend an active session at most once a minute (avoids a DB write on every request).
RENEW_AFTER = timedelta(minutes=1)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False


def authenticate(db: Session, username: str, password: str) -> AdminUser | None:
    user = db.scalar(select(AdminUser).where(AdminUser.username == username, AdminUser.active.is_(True)))
    if user and verify_password(password, user.password_hash):
        return user
    return None


def _utc(value: datetime) -> datetime:
    # SQLite returns naive datetimes; everything here is stored in UTC.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _session_lifetime() -> timedelta:
    return timedelta(hours=settings.admin_session_hours)


def create_session(db: Session, user: AdminUser, request: Request) -> str:
    """Start a server-side session and return the signed cookie value."""
    now = datetime.now(timezone.utc)
    db.execute(delete(AdminSession).where(AdminSession.expires_at < now - timedelta(days=1)))
    session = AdminSession(
        id=secrets.token_urlsafe(32),
        user_id=user.id,
        created_at=now,
        last_seen_at=now,
        expires_at=now + _session_lifetime(),
        ip=(request.client.host if request.client else "")[:64],
        user_agent=request.headers.get("user-agent", "")[:300],
    )
    db.add(session)
    db.commit()
    return jwt.encode({"sid": session.id, "sub": user.username}, settings.admin_jwt_secret, ALGORITHM)


def issue_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="strict", secure=settings.cookie_secure,
        max_age=settings.admin_session_hours * 3600, path="/",
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="strict", secure=settings.cookie_secure)


def _session_id(request: Request) -> str | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.admin_jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    sid = payload.get("sid")
    return sid if isinstance(sid, str) else None


def session_user(request: Request, db: Session) -> AdminUser | None:
    """The signed-in user for this request, or None. Active sessions slide forward (idle timeout)
    and the cookie is re-issued by the middleware in app.main."""
    if hasattr(request.state, "admin_user"):
        return request.state.admin_user
    user = None
    sid = _session_id(request)
    session = db.get(AdminSession, sid) if sid else None
    now = datetime.now(timezone.utc)
    if session and not session.revoked and _utc(session.expires_at) > now:
        user = db.scalar(select(AdminUser).where(AdminUser.id == session.user_id, AdminUser.active.is_(True)))
        if user and now - _utc(session.last_seen_at) > RENEW_AFTER:
            session.last_seen_at = now
            session.expires_at = now + _session_lifetime()
            db.commit()
            request.state.renew_cookie = request.cookies.get(COOKIE_NAME)
    elif sid:
        request.state.clear_cookie = True
    request.state.admin_user = user
    return user


def revoke_session(db: Session, request: Request) -> None:
    sid = _session_id(request)
    session = db.get(AdminSession, sid) if sid else None
    if session and not session.revoked:
        session.revoked = True
        db.commit()


def revoke_user_sessions(db: Session, user_id: int) -> None:
    db.execute(update(AdminSession).where(AdminSession.user_id == user_id).values(revoked=True))
    db.commit()


def optional_admin(request: Request, db: Session = Depends(get_db)) -> AdminUser | None:
    return session_user(request, db)


def current_admin(user: AdminUser | None = Depends(optional_admin)) -> AdminUser:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
    return user


def require_admin_role(user: AdminUser = Depends(current_admin)) -> AdminUser:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")
    return user


def audit(db: Session, user: AdminUser, action: str, target: str = "", detail: str = "") -> None:
    db.add(AuditLog(username=user.username, action=action, target=target[:300], detail=detail[:4000]))
    db.commit()
