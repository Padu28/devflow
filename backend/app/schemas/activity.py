from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.common import Priority, UserBrief
from app.schemas.project import ProjectSummaryOut
from app.schemas.task import TaskCardOut


class ActivityEventOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID | None = None
    actor: UserBrief
    entity_type: str
    entity_id: uuid.UUID
    action: str
    metadata: dict[str, Any]
    created_at: datetime


class NotificationOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    read_at: datetime | None = None
    created_at: datetime
    event: ActivityEventOut


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None = None
    unread_count: int


class UnreadCountOut(BaseModel):
    unread_count: int


class AnalyticsTotalsOut(BaseModel):
    tasks: int
    open: int
    completed: int
    overdue: int
    due_this_week: int


class AnalyticsStatusCountOut(BaseModel):
    name: str
    count: int
    is_done: bool


class AnalyticsPriorityCountOut(BaseModel):
    priority: Priority
    count: int


class AnalyticsTrendPointOut(BaseModel):
    date: str
    created: int
    completed: int


class AnalyticsWorkloadOut(BaseModel):
    user: UserBrief
    open: int
    overdue: int
    completed: int


class AnalyticsProjectActivityOut(BaseModel):
    project_id: uuid.UUID
    name: str
    color: str
    events: int


class AnalyticsOverviewOut(BaseModel):
    totals: AnalyticsTotalsOut
    by_status: list[AnalyticsStatusCountOut]
    by_priority: list[AnalyticsPriorityCountOut]
    completion_trend: list[AnalyticsTrendPointOut]
    workload: list[AnalyticsWorkloadOut]
    project_activity: list[AnalyticsProjectActivityOut]


class SearchTaskHitOut(TaskCardOut):
    project_name: str
    project_color: str


class SearchOut(BaseModel):
    tasks: list[SearchTaskHitOut]
    projects: list[ProjectSummaryOut]
