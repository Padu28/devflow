from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import anyio

from app.realtime.manager import manager


def build_envelope(
    event_type: str,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID,
    entity_id: uuid.UUID,
    payload: dict[str, Any],
    project_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    return {
        "event_id": str(uuid.uuid4()),
        "type": event_type,
        "tenant_id": str(tenant_id),
        "actor_id": str(actor_id),
        "entity_id": str(entity_id),
        "project_id": str(project_id) if project_id else None,
        "timestamp": datetime.now(UTC).isoformat(),
        "payload": payload,
    }


def dispatch_after_commit(
    events: list[tuple[uuid.UUID, dict[str, Any], uuid.UUID | None]],
) -> None:
    """Publish queued realtime events from sync route handlers after DB commit."""
    if not events:
        return

    async def _send_all() -> None:
        for org_id, envelope, target_user_id in events:
            await manager.publish(org_id, envelope, target_user_id=target_user_id)

    try:
        anyio.from_thread.run(_send_all)
    except RuntimeError:
        # Fallback when called directly on an event loop thread without worker thread
        import asyncio

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_send_all())
        except RuntimeError:
            pass
