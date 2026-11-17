from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class _ClientConn:
    ws: WebSocket
    org_id: uuid.UUID
    user_id: uuid.UUID
    project_id: uuid.UUID | None = None
    last_checked: float = field(default_factory=time.monotonic)


class ConnectionManager:
    """In-process WebSocket manager with presence, membership cache, and Redis pub/sub."""

    def __init__(self) -> None:
        self._by_org: dict[uuid.UUID, list[_ClientConn]] = {}
        self._lock = asyncio.Lock()
        self._redis_task: asyncio.Task[None] | None = None
        self._redis_pub: Any = None
        self._instance_id = str(uuid.uuid4())

    async def start_redis_bridge(self, redis_url: str) -> None:
        if not redis_url or self._redis_task is not None:
            return
        try:
            import redis.asyncio as aioredis

            self._redis_pub = aioredis.from_url(redis_url, decode_responses=True)
            self._redis_task = asyncio.create_task(self._redis_listener(redis_url))
        except Exception as exc:
            logger.warning("Redis pub/sub bridge disabled: %s", exc)

    async def stop_redis_bridge(self) -> None:
        if self._redis_task is not None:
            self._redis_task.cancel()
            self._redis_task = None
        if self._redis_pub is not None:
            with contextlib.suppress(Exception):
                await self._redis_pub.aclose()
            self._redis_pub = None

    async def _redis_listener(self, redis_url: str) -> None:
        import redis.asyncio as aioredis

        client = aioredis.from_url(redis_url, decode_responses=True)
        pubsub = client.pubsub()
        await pubsub.psubscribe("devflow:org:*")
        try:
            async for message in pubsub.listen():
                if message.get("type") != "pmessage":
                    continue
                try:
                    data = json.loads(message["data"])
                    if data.get("_origin") == self._instance_id:
                        continue
                    org_id = uuid.UUID(data["tenant_id"])
                    target_user_id = (
                        uuid.UUID(data["target_user_id"]) if data.get("target_user_id") else None
                    )
                    envelope = data["envelope"]
                    await self._deliver_local(org_id, envelope, target_user_id=target_user_id)
                except Exception as exc:
                    logger.debug("Ignoring malformed redis pubsub message: %s", exc)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.close()
            await client.aclose()

    async def connect(self, ws: WebSocket, org_id: uuid.UUID, user_id: uuid.UUID) -> _ClientConn:
        await ws.accept()
        conn = _ClientConn(ws=ws, org_id=org_id, user_id=user_id)
        async with self._lock:
            self._by_org.setdefault(org_id, []).append(conn)
        return conn

    async def disconnect(self, conn: _ClientConn) -> None:
        async with self._lock:
            conns = self._by_org.get(conn.org_id)
            if conns and conn in conns:
                conns.remove(conn)
                if not conns:
                    self._by_org.pop(conn.org_id, None)

    async def set_presence(self, conn: _ClientConn, project_id: uuid.UUID | None) -> None:
        conn.project_id = project_id

    async def get_presence_users(
        self, org_id: uuid.UUID, user_lookup: dict[uuid.UUID, dict[str, Any]]
    ) -> list[dict[str, Any]]:
        async with self._lock:
            conns = list(self._by_org.get(org_id, []))
        seen: dict[uuid.UUID, dict[str, Any]] = {}
        for c in conns:
            u = user_lookup.get(c.user_id)
            if u:
                seen[c.user_id] = {
                    "user": u,
                    "project_id": str(c.project_id) if c.project_id else None,
                }
        return list(seen.values())

    async def revoke_user(self, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
        async with self._lock:
            conns = list(self._by_org.get(org_id, []))
        for c in conns:
            if c.user_id == user_id:
                with contextlib.suppress(Exception):
                    await c.ws.close(code=4403)
                await self.disconnect(c)

    def _verify_membership_sync(self, org_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        from sqlalchemy import select

        from app.db import session as db_session
        from app.models.organization import Membership

        with db_session.SessionLocal() as db:
            row = db.scalar(
                select(Membership.id).where(
                    Membership.organization_id == org_id,
                    Membership.user_id == user_id,
                )
            )
            return row is not None

    async def publish(
        self,
        org_id: uuid.UUID,
        envelope: dict[str, Any],
        target_user_id: uuid.UUID | None = None,
    ) -> None:
        if self._redis_pub is not None:
            try:
                msg = json.dumps(
                    {
                        "_origin": self._instance_id,
                        "tenant_id": str(org_id),
                        "target_user_id": str(target_user_id) if target_user_id else None,
                        "envelope": envelope,
                    },
                    default=str,
                )
                await self._redis_pub.publish(f"devflow:org:{org_id}", msg)
            except Exception as exc:
                logger.warning("Redis publish failed: %s", exc)
        await self._deliver_local(org_id, envelope, target_user_id=target_user_id)

    async def _deliver_local(
        self,
        org_id: uuid.UUID,
        envelope: dict[str, Any],
        target_user_id: uuid.UUID | None = None,
    ) -> None:
        async with self._lock:
            conns = list(self._by_org.get(org_id, []))
        if not conns:
            return

        now = time.monotonic()
        payload_text = json.dumps(envelope, default=str)
        dead: list[_ClientConn] = []
        for c in conns:
            if target_user_id is not None and c.user_id != target_user_id:
                continue
            if now - c.last_checked > 30.0:
                is_member = self._verify_membership_sync(org_id, c.user_id)
                if not is_member:
                    with contextlib.suppress(Exception):
                        await c.ws.close(code=4403)
                    dead.append(c)
                    continue
                c.last_checked = now
            try:
                await c.ws.send_text(payload_text)
            except Exception:
                dead.append(c)

        for c in dead:
            await self.disconnect(c)


manager = ConnectionManager()
