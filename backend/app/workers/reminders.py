"""Background job hooks (Celery / RQ integration point).

DevFlow runs as a modular monolith: synchronous HTTP requests handle transactional
writes and publish realtime events after commit. Tasks that should not block an API
request (e.g. daily due-soon digest emails, webhook retries, bulk exports) plug in here
when REDIS_URL is configured.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models.task import Task

logger = logging.getLogger(__name__)


def collect_due_soon_tasks(db: Session, hours: int = 24) -> list[Task]:
    """Return open tasks due within the next `hours` hours for reminder dispatch."""
    now = utcnow()
    horizon = now + timedelta(hours=hours)
    return list(
        db.scalars(
            select(Task).where(
                Task.completed_at.is_(None),
                Task.due_at.is_not(None),
                Task.due_at >= now,
                Task.due_at <= horizon,
            )
        ).all()
    )
