from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models.activity import ActivityEvent
from app.models.organization import Membership
from app.models.project import BoardColumn, Project
from app.models.task import Task
from app.models.user import User
from app.repositories.tenancy import get_org_membership, get_project_with_membership
from app.schemas.activity import (
    AnalyticsOverviewOut,
    AnalyticsPriorityCountOut,
    AnalyticsProjectActivityOut,
    AnalyticsStatusCountOut,
    AnalyticsTotalsOut,
    AnalyticsTrendPointOut,
    AnalyticsWorkloadOut,
)
from app.schemas.common import Priority
from app.services.activity_service import to_user_brief


def _day_str(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%d")


def get_analytics_overview(
    db: Session,
    org_id: uuid.UUID,
    user: User,
    project_id: uuid.UUID | None = None,
    days: int = 30,
) -> AnalyticsOverviewOut:
    get_org_membership(db, org_id, user.id)
    if project_id is not None:
        proj, _, _ = get_project_with_membership(db, project_id, user.id)
        if proj.organization_id != org_id:
            from app.core.errors import NotFoundError

            raise NotFoundError("Project not found")

    now = utcnow()
    week_end = now + timedelta(days=7)
    window_start = (now - timedelta(days=days - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    base_filter = [Project.organization_id == org_id, Project.archived_at.is_(None)]
    if project_id is not None:
        base_filter.append(Project.id == project_id)

    totals_row = db.execute(
        select(
            func.count(Task.id),
            func.sum(case((Task.completed_at.is_(None), 1), else_=0)),
            func.sum(case((Task.completed_at.is_not(None), 1), else_=0)),
            func.sum(
                case(
                    (
                        (Task.completed_at.is_(None))
                        & (Task.due_at.is_not(None))
                        & (Task.due_at < now),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(
                case(
                    (
                        (Task.completed_at.is_(None))
                        & (Task.due_at.is_not(None))
                        & (Task.due_at >= now)
                        & (Task.due_at <= week_end),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .select_from(Task)
        .join(Project, Project.id == Task.project_id)
        .where(*base_filter)
    ).one()

    totals = AnalyticsTotalsOut(
        tasks=int(totals_row[0] or 0),
        open=int(totals_row[1] or 0),
        completed=int(totals_row[2] or 0),
        overdue=int(totals_row[3] or 0),
        due_this_week=int(totals_row[4] or 0),
    )

    status_rows = db.execute(
        select(BoardColumn.name, BoardColumn.is_done, func.count(Task.id))
        .select_from(BoardColumn)
        .join(Project, Project.id == BoardColumn.project_id)
        .outerjoin(Task, Task.column_id == BoardColumn.id)
        .where(*base_filter)
        .group_by(BoardColumn.name, BoardColumn.is_done)
    ).all()
    by_status = [
        AnalyticsStatusCountOut(name=r[0], is_done=bool(r[1]), count=int(r[2] or 0))
        for r in status_rows
    ]

    prio_rows = db.execute(
        select(Task.priority, func.count(Task.id))
        .select_from(Task)
        .join(Project, Project.id == Task.project_id)
        .where(*base_filter)
        .group_by(Task.priority)
    ).all()
    prio_map = {r[0]: int(r[1] or 0) for r in prio_rows}
    by_priority = [
        AnalyticsPriorityCountOut(priority=p, count=prio_map.get(p, 0))
        for p in cast(tuple[Priority, ...], ("urgent", "high", "medium", "low", "none"))
        if prio_map.get(p, 0) > 0
    ]

    # Completion trend over window (portable across SQLite and PostgreSQL)
    created_dates = db.scalars(
        select(Task.created_at)
        .join(Project, Project.id == Task.project_id)
        .where(*base_filter, Task.created_at >= window_start)
    ).all()
    completed_dates = db.scalars(
        select(Task.completed_at)
        .join(Project, Project.id == Task.project_id)
        .where(*base_filter, Task.completed_at.is_not(None), Task.completed_at >= window_start)
    ).all()
    created_by_day: dict[str, int] = {}
    for dt in created_dates:
        d = _day_str(dt)
        created_by_day[d] = created_by_day.get(d, 0) + 1
    completed_by_day: dict[str, int] = {}
    for cdt in completed_dates:
        if cdt is not None:
            d = _day_str(cdt)
            completed_by_day[d] = completed_by_day.get(d, 0) + 1

    completion_trend: list[AnalyticsTrendPointOut] = []
    for offset in range(days):
        day = (window_start + timedelta(days=offset)).strftime("%Y-%m-%d")
        completion_trend.append(
            AnalyticsTrendPointOut(
                date=day,
                created=created_by_day.get(day, 0),
                completed=completed_by_day.get(day, 0),
            )
        )

    # Workload by member
    members = db.scalars(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.organization_id == org_id)
        .order_by(User.display_name.asc())
    ).all()
    workload_rows = db.execute(
        select(
            Task.assignee_id,
            func.sum(case((Task.completed_at.is_(None), 1), else_=0)),
            func.sum(
                case(
                    (
                        (Task.completed_at.is_(None))
                        & (Task.due_at.is_not(None))
                        & (Task.due_at < now),
                        1,
                    ),
                    else_=0,
                )
            ),
            func.sum(case((Task.completed_at.is_not(None), 1), else_=0)),
        )
        .select_from(Task)
        .join(Project, Project.id == Task.project_id)
        .where(*base_filter, Task.assignee_id.is_not(None))
        .group_by(Task.assignee_id)
    ).all()
    wl_map = {r[0]: (int(r[1] or 0), int(r[2] or 0), int(r[3] or 0)) for r in workload_rows}
    workload = [
        AnalyticsWorkloadOut(
            user=to_user_brief(m),
            open=wl_map.get(m.id, (0, 0, 0))[0],
            overdue=wl_map.get(m.id, (0, 0, 0))[1],
            completed=wl_map.get(m.id, (0, 0, 0))[2],
        )
        for m in members
    ]

    # Project activity counts in window
    act_rows = db.execute(
        select(Project.id, Project.name, Project.color, func.count(ActivityEvent.id))
        .select_from(Project)
        .outerjoin(
            ActivityEvent,
            (ActivityEvent.project_id == Project.id) & (ActivityEvent.created_at >= window_start),
        )
        .where(*base_filter)
        .group_by(Project.id, Project.name, Project.color)
        .order_by(func.count(ActivityEvent.id).desc())
    ).all()
    project_activity = [
        AnalyticsProjectActivityOut(
            project_id=r[0],
            name=r[1],
            color=r[2],
            events=int(r[3] or 0),
        )
        for r in act_rows
    ]

    return AnalyticsOverviewOut(
        totals=totals,
        by_status=by_status,
        by_priority=by_priority,
        completion_trend=completion_trend,
        workload=workload,
        project_activity=project_activity,
    )
