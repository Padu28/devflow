from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import BadRequestError, ConflictError, UnauthorizedError
from app.core.security import (
    create_access_token,
    generate_opaque_token,
    hash_password,
    hash_token,
    verify_dummy_password,
    verify_password,
)
from app.db.base import utcnow
from app.models.user import NotificationPreference, PasswordResetToken, RefreshToken, User
from app.schemas.auth import (
    AuthResponse,
    LoginIn,
    NotificationPreferencesIn,
    NotificationPreferencesOut,
    PasswordChangeIn,
    PasswordResetConfirmIn,
    PasswordResetRequestOut,
    RegisterIn,
    UserUpdateIn,
)
from app.schemas.common import UserOut

logger = logging.getLogger(__name__)

AVATAR_COLORS = ["#C6F432", "#38BDF8", "#A78BFA", "#FB923C", "#10B981", "#F43F5E"]


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _issue_session(
    db: Session, user: User, family_id: uuid.UUID | None = None
) -> tuple[AuthResponse, str]:
    settings = get_settings()
    access_token, expires_in = create_access_token(user.id)
    raw_refresh = generate_opaque_token(48)
    fam = family_id or uuid.uuid4()
    rt = RefreshToken(
        user_id=user.id,
        family_id=fam,
        token_hash=hash_token(raw_refresh),
        expires_at=utcnow() + timedelta(days=settings.refresh_token_ttl_days),
    )
    db.add(rt)
    db.commit()
    db.refresh(user)
    return (
        AuthResponse(
            access_token=access_token,
            expires_in=expires_in,
            user=UserOut.model_validate(user),
        ),
        raw_refresh,
    )


def register_user(db: Session, data: RegisterIn) -> tuple[AuthResponse, str]:
    email = data.email.strip().lower()
    existing = db.scalar(select(User.id).where(User.email == email))
    if existing:
        raise ConflictError("An account with this email already exists")

    color = AVATAR_COLORS[uuid.uuid4().int % len(AVATAR_COLORS)]
    user = User(
        email=email,
        password_hash=hash_password(data.password),
        display_name=data.display_name.strip(),
        avatar_color=color,
    )
    db.add(user)
    db.flush()
    db.add(NotificationPreference(user_id=user.id))
    return _issue_session(db, user)


def login_user(db: Session, data: LoginIn) -> tuple[AuthResponse, str]:
    email = data.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        verify_dummy_password(data.password)
        raise UnauthorizedError("Invalid email or password")
    if not verify_password(data.password, user.password_hash):
        raise UnauthorizedError("Invalid email or password")
    return _issue_session(db, user)


def refresh_session(db: Session, raw_refresh: str | None) -> tuple[AuthResponse, str]:
    if not raw_refresh:
        raise UnauthorizedError("Missing refresh token")
    token_hash = hash_token(raw_refresh)
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if not rt:
        raise UnauthorizedError("Invalid refresh token")

    now = utcnow()
    if rt.revoked_at is not None:
        # Reuse of a rotated/revoked token: revoke the entire family as theft protection.
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == rt.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        raise UnauthorizedError("Refresh token reuse detected; session revoked")

    if _as_utc(rt.expires_at) <= now:
        rt.revoked_at = now
        db.commit()
        raise UnauthorizedError("Refresh token expired")

    user = db.get(User, rt.user_id)
    if not user:
        raise UnauthorizedError("User not found")

    rt.revoked_at = now
    db.flush()
    return _issue_session(db, user, family_id=rt.family_id)


def logout_session(db: Session, raw_refresh: str | None) -> None:
    if not raw_refresh:
        return
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_refresh)))
    if rt:
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == rt.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        db.commit()


def request_password_reset(db: Session, email_raw: str) -> PasswordResetRequestOut:
    settings = get_settings()
    email = email_raw.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    dev_token: str | None = None
    if user:
        raw_token = generate_opaque_token(32)
        prt = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=utcnow() + timedelta(minutes=settings.password_reset_ttl_minutes),
        )
        db.add(prt)
        db.commit()
        reset_link = f"{settings.frontend_url}/reset-password?token={raw_token}"
        logger.info("Password reset requested for %s -> %s", email, reset_link)
        if settings.environment == "development":
            dev_token = raw_token
    return PasswordResetRequestOut(
        message="If an account exists for that email, a reset link has been sent.",
        dev_reset_token=dev_token,
    )


def confirm_password_reset(db: Session, data: PasswordResetConfirmIn) -> None:
    token_hash = hash_token(data.token)
    prt = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash))
    now = utcnow()
    if not prt or prt.used_at is not None or _as_utc(prt.expires_at) <= now:
        raise BadRequestError("Invalid or expired password reset token")

    user = db.get(User, prt.user_id)
    if not user:
        raise BadRequestError("Invalid password reset token")

    user.password_hash = hash_password(data.new_password)
    prt.used_at = now
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    db.commit()


def update_user_profile(db: Session, user: User, data: UserUpdateIn) -> UserOut:
    if data.display_name is not None:
        s = data.display_name.strip()
        if not s:
            raise BadRequestError("Display name cannot be blank")
        user.display_name = s
    if data.avatar_color is not None:
        user.avatar_color = data.avatar_color
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


def change_user_password(db: Session, user: User, data: PasswordChangeIn) -> None:
    if not verify_password(data.current_password, user.password_hash):
        raise UnauthorizedError("Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    db.commit()


def get_notification_preferences(db: Session, user: User) -> NotificationPreferencesOut:
    pref = db.get(NotificationPreference, user.id)
    if not pref:
        pref = NotificationPreference(user_id=user.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return NotificationPreferencesOut.model_validate(pref)


def update_notification_preferences(
    db: Session, user: User, data: NotificationPreferencesIn
) -> NotificationPreferencesOut:
    pref = db.get(NotificationPreference, user.id)
    if not pref:
        pref = NotificationPreference(user_id=user.id)
        db.add(pref)
    pref.on_assigned = data.on_assigned
    pref.on_comment = data.on_comment
    pref.on_status_change = data.on_status_change
    pref.on_invitation = data.on_invitation
    db.commit()
    db.refresh(pref)
    return NotificationPreferencesOut.model_validate(pref)
