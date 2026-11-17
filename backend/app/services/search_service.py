from __future__ import annotations

import re
import uuid

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.repositories.tenancy import get_org_membership
from app.schemas.activity import SearchOut, SearchTaskHitOut
from app.services.project_service import build_project_summaries
from app.services.task_service import serialize_task_cards


def search_workspace(
    db: Session,
    org_id: uuid.UUID,
    user: User,
    q: str,
    limit: int = 8,
) -> SearchOut:
    get_org_membership(db, org_id, user.id)
    query_str = q.strip()
    if not query_str:
        return SearchOut(tasks=[], projects=[])

    pat = f"%{query_str}%"
    proj_rows = list(
        db.scalars(
            select(Project)
            .options(selectinload(Project.creator))
            .where(
                Project.organization_id == org_id,
                Project.archived_at.is_(None),
                or_(
                    Project.name.ilike(pat),
                    Project.key.ilike(pat),
                    Project.description.ilike(pat),
                ),
            )
            .order_by(Project.updated_at.desc())
            .limit(limit)
        ).all()
    )
    projects = build_project_summaries(db, proj_rows)

    key_match = re.match(r"^([A-Za-z]{2,6})-(\d+)$", query_str)
    task_cond = or_(Task.title.ilike(pat), Task.description.ilike(pat))
    if key_match:
        key_prefix = key_match.group(1).upper()
        num = int(key_match.group(2))
        task_cond = or_(task_cond, and_(Project.key == key_prefix, Task.number == num))

    task_rows = db.execute(
        select(Task, Project)
        .join(Project, Project.id == Task.project_id)
        .options(selectinload(Task.assignee), selectinload(Task.labels))
        .where(
            Project.organization_id == org_id,
            Project.archived_at.is_(None),
            task_cond,
        )
        .order_by(Task.updated_at.desc())
        .limit(limit)
    ).all()

    task_hits: list[SearchTaskHitOut] = []
    if task_rows:
        # Group by project_key for serialization while preserving order
        by_proj_key: dict[uuid.UUID, Project] = {p.id: p for _, p in task_rows}
        cards_by_id = {}
        for pid, proj in by_proj_key.items():
            proj_tasks = [t for t, p in task_rows if p.id == pid]
            for card in serialize_task_cards(db, proj_tasks, proj.key):
                cards_by_id[card.id] = card
        for t, p in task_rows:
            card = cards_by_id[t.id]
            task_hits.append(
                SearchTaskHitOut(
                    **card.model_dump(),
                    project_name=p.name,
                    project_color=p.color,
                )
            )

    return SearchOut(tasks=task_hits, projects=projects)
