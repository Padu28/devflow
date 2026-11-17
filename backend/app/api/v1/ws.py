from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.security import decode_access_token
from app.db import session as db_session
from app.db.base import utcnow
from app.models.organization import Membership
from app.realtime.events import build_envelope
from app.realtime.manager import manager
from app.services.activity_service import to_user_brief

router = APIRouter(tags=["realtime"])


def _org_user_lookup(org_id: uuid.UUID) -> dict[uuid.UUID, dict[str, Any]]:
    with db_session.SessionLocal() as db:
        members = db.scalars(
            select(Membership)
            .options(selectinload(Membership.user))
            .where(Membership.organization_id == org_id)
        ).all()
        return {m.user_id: to_user_brief(m.user).model_dump(mode="json") for m in members}


async def _broadcast_presence(org_id: uuid.UUID, actor_id: uuid.UUID) -> None:
    lookup = _org_user_lookup(org_id)
    users = await manager.get_presence_users(org_id, lookup)
    env = build_envelope(
        "presence.state",
        tenant_id=org_id,
        actor_id=actor_id,
        entity_id=org_id,
        payload={"users": users},
    )
    await manager.publish(org_id, env)


@router.websocket("/ws/organizations/{org_id}")
async def org_websocket(
    websocket: WebSocket,
    org_id: uuid.UUID,
    token: str | None = Query(default=None),
) -> None:
    if not token:
        await websocket.close(code=4401)
        return
    user_id = decode_access_token(token)
    if not user_id:
        await websocket.close(code=4401)
        return

    with db_session.SessionLocal() as db:
        member = db.scalar(
            select(Membership.id).where(
                Membership.organization_id == org_id,
                Membership.user_id == user_id,
            )
        )
        if not member:
            await websocket.close(code=4403)
            return

    conn = await manager.connect(websocket, org_id, user_id)
    try:
        hello = build_envelope(
            "hello",
            tenant_id=org_id,
            actor_id=user_id,
            entity_id=org_id,
            payload={"user_id": str(user_id), "server_time": utcnow().isoformat()},
        )
        await websocket.send_text(json.dumps(hello))
        await _broadcast_presence(org_id, user_id)

        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            mtype = msg.get("type")
            if mtype == "ping":
                pong = build_envelope(
                    "pong",
                    tenant_id=org_id,
                    actor_id=user_id,
                    entity_id=org_id,
                    payload={},
                )
                await websocket.send_text(json.dumps(pong))
            elif mtype == "presence.view":
                pid_raw = msg.get("project_id")
                pid: uuid.UUID | None = None
                if pid_raw:
                    try:
                        pid = uuid.UUID(str(pid_raw))
                    except ValueError:
                        pid = None
                await manager.set_presence(conn, pid)
                await _broadcast_presence(org_id, user_id)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(conn)
        await _broadcast_presence(org_id, user_id)
