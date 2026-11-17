from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BadRequestError, NotFoundError
from app.models.activity import ActivityEvent, Notification
from app.models.user import NotificationPreference, User
from app.realtime.events import build_envelope
from app.schemas.activity import ActivityEventOut, NotificationListOut, NotificationOut
from app.schemas.common import CursorResponse, UserBrief

RealtimeQueue = list[tuple[uuid.UUID, dict[str, Any], uuid.UUID | None]]


def encode_cursor(created_at: datetime, item_id: uuid.UUID) -> str:
    raw = json.dumps({"ts": created_at.isoformat(), "id": str(item_id)})
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8"))
        return datetime.fromisoformat(data["ts"]), uuid.UUID(data["id"])
    except Exception as exc:
        raise BadRequestError("Invalid pagination cursor") from exc


def to_user_brief(user: User) -> UserBrief:
    return UserBrief(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_color=user.avatar_color,
    )


def to_activity_out(ev: ActivityEvent) -> ActivityEventOut:
    return ActivityEventOut(
        id=ev.id,
        organization_id=ev.organization_id,
        project_id=ev.project_id,
        actor=to_user_brief(ev.actor),
        entity_type=ev.entity_type,
        entity_id=ev.entity_id,
        action=ev.action,
        metadata=ev.metadata_json or {},
        created_at=ev.created_at,
    )


def record_activity(
    db: Session,
    *,
    organization_id: uuid.UUID,
    project_id: uuid.UUID | None,
    actor_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    metadata: dict[str, Any] | None = None,
) -> ActivityEvent:
    ev = ActivityEvent(
        organization_id=organization_id,
        project_id=project_id,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        metadata_json=metadata or {},
    )
    db.add(ev)
    db.flush()
    return ev


def notify_users(
    db: Session,
    *,
    event: ActivityEvent,
    actor: User,
    recipient_ids: set[uuid.UUID],
    pref_field: str,
    rt_queue: RealtimeQueue | None = None,
) -> None:
    targets = {uid for uid in recipient_ids if uid != actor.id}
    if not targets:
        return

    prefs = {
        p.user_id: p
        for p in db.scalars(
            select(NotificationPreference).where(NotificationPreference.user_id.in_(targets))
        ).all()
    }

    ev_out = ActivityEventOut(
        id=event.id,
        organization_id=event.organization_id,
        project_id=event.project_id,
        actor=to_user_brief(actor),
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        action=event.action,
        metadata=event.metadata_json or {},
        created_at=event.created_at,
    )

    for uid in targets:
        pref = prefs.get(uid)
        if pref is not None and not getattr(pref, pref_field, True):
            continue
        notif = Notification(
            recipient_id=uid,
            organization_id=event.organization_id,
            event_id=event.id,
        )
        db.add(notif)
        db.flush()
        if rt_queue is not None:
            notif_out = NotificationOut(
                id=notif.id,
                organization_id=notif.organization_id,
                read_at=notif.read_at,
                created_at=notif.created_at,
                event=ev_out,
            )
            rt_queue.append(
                (
                    event.organization_id,
                    build_envelope(
                        "notification.created",
                        tenant_id=event.organization_id,
                        actor_id=actor.id,
                        entity_id=notif.id,
                        project_id=event.project_id,
                        payload={"notification": notif_out.model_dump(mode="json")},
                    ),
                    uid,
                )
            )


def list_org_activity(
    db: Session,
    org_id: uuid.UUID,
    cursor: str | None = None,
    limit: int = 20,
) -> CursorResponse[ActivityEventOut]:
    stmt = (
        select(ActivityEvent)
        .options(selectinload(ActivityEvent.actor))
        .where(ActivityEvent.organization_id == org_id)
    )
    if cursor:
        ts, cid = decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                ActivityEvent.created_at < ts,
                and_(ActivityEvent.created_at == ts, ActivityEvent.id < cid),
            )
        )
    rows = db.scalars(
        stmt.order_by(ActivityEvent.created_at.desc(), ActivityEvent.id.desc()).limit(limit + 1)
    ).all()
    has_more = len(rows) > limit
    items = [to_activity_out(r) for r in rows[:limit]]
    next_cursor = (
        encode_cursor(rows[limit - 1].created_at, rows[limit - 1].id) if has_more else None
    )
    return CursorResponse(items=items, next_cursor=next_cursor)


def list_project_activity(
    db: Session,
    project_id: uuid.UUID,
    cursor: str | None = None,
    limit: int = 20,
) -> CursorResponse[ActivityEventOut]:
    stmt = (
        select(ActivityEvent)
        .options(selectinload(ActivityEvent.actor))
        .where(ActivityEvent.project_id == project_id)
    )
    if cursor:
        ts, cid = decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                ActivityEvent.created_at < ts,
                and_(ActivityEvent.created_at == ts, ActivityEvent.id < cid),
            )
        )
    rows = db.scalars(
        stmt.order_by(ActivityEvent.created_at.desc(), ActivityEvent.id.desc()).limit(limit + 1)
    ).all()
    has_more = len(rows) > limit
    items = [to_activity_out(r) for r in rows[:limit]]
    next_cursor = (
        encode_cursor(rows[limit - 1].created_at, rows[limit - 1].id) if has_more else None
    )
    return CursorResponse(items=items, next_cursor=next_cursor)


def list_notifications(
    db: Session,
    user_id: uuid.UUID,
    unread_only: bool = False,
    cursor: str | None = None,
    limit: int = 20,
) -> NotificationListOut:
    stmt = (
        select(Notification)
        .options(selectinload(Notification.event).selectinload(ActivityEvent.actor))
        .where(Notification.recipient_id == user_id)
    )
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    if cursor:
        ts, cid = decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                Notification.created_at < ts,
                and_(Notification.created_at == ts, Notification.id < cid),
            )
        )
    rows = db.scalars(
        stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit + 1)
    ).all()
    has_more = len(rows) > limit
    items = [
        NotificationOut(
            id=n.id,
            organization_id=n.organization_id,
            read_at=n.read_at,
            created_at=n.created_at,
            event=to_activity_out(n.event),
        )
        for n in rows[:limit]
    ]
    next_cursor = (
        encode_cursor(rows[limit - 1].created_at, rows[limit - 1].id) if has_more else None
    )
    unread_count = (
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.recipient_id == user_id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )
    return NotificationListOut(items=items, next_cursor=next_cursor, unread_count=unread_count)


def unread_notification_count(db: Session, user_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.recipient_id == user_id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    )


def mark_notification_read(
    db: Session, user_id: uuid.UUID, notification_id: uuid.UUID
) -> NotificationOut:
    notif = db.scalar(
        select(Notification)
        .options(selectinload(Notification.event).selectinload(ActivityEvent.actor))
        .where(Notification.id == notification_id, Notification.recipient_id == user_id)
    )
    if not notif:
        raise NotFoundError("Notification not found")
    if notif.read_at is None:
        from app.db.base import utcnow

        notif.read_at = utcnow()
        db.commit()
        db.refresh(notif)
    return NotificationOut(
        id=notif.id,
        organization_id=notif.organization_id,
        read_at=notif.read_at,
        created_at=notif.created_at,
        event=to_activity_out(notif.event),
    )


def mark_all_notifications_read(db: Session, user_id: uuid.UUID) -> None:
    from sqlalchemy import update

    from app.db.base import utcnow

    db.execute(
        update(Notification)
        .where(Notification.recipient_id == user_id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
