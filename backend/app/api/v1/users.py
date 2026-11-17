from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    NotificationPreferencesIn,
    NotificationPreferencesOut,
    PasswordChangeIn,
    UserUpdateIn,
)
from app.schemas.common import UserOut
from app.services import auth_service

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut, summary="Update current user profile")
def update_me(
    body: UserUpdateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    return auth_service.update_user_profile(db, user, body)


@router.post(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change current user password",
)
def change_password(
    body: PasswordChangeIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    auth_service.change_user_password(db, user, body)


@router.get(
    "/me/notification-preferences",
    response_model=NotificationPreferencesOut,
    summary="Get notification preferences",
)
def get_preferences(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NotificationPreferencesOut:
    return auth_service.get_notification_preferences(db, user)


@router.put(
    "/me/notification-preferences",
    response_model=NotificationPreferencesOut,
    summary="Update notification preferences",
)
def put_preferences(
    body: NotificationPreferencesIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NotificationPreferencesOut:
    return auth_service.update_notification_preferences(db, user, body)
