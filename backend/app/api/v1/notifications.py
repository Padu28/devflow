from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.activity import NotificationListOut, NotificationOut, UnreadCountOut
from app.services import activity_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut, summary="List my notifications")
def list_notifications(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    unread_only: bool = False,
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
) -> NotificationListOut:
    return activity_service.list_notifications(
        db, user.id, unread_only=unread_only, cursor=cursor, limit=limit
    )


@router.get("/unread-count", response_model=UnreadCountOut, summary="Unread notification count")
def unread_count(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UnreadCountOut:
    return UnreadCountOut(unread_count=activity_service.unread_notification_count(db, user.id))


@router.post(
    "/{notification_id}/read",
    response_model=NotificationOut,
    summary="Mark notification as read",
)
def mark_read(
    notification_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NotificationOut:
    return activity_service.mark_notification_read(db, user.id, notification_id)


@router.post("/read-all", response_model=UnreadCountOut, summary="Mark all notifications read")
def mark_all_read(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UnreadCountOut:
    activity_service.mark_all_notifications_read(db, user.id)
    return UnreadCountOut(unread_count=0)
