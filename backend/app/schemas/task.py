from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ColumnOut, LabelOut, OrmModel, Priority, UserBrief
from app.schemas.project import ProjectDetailOut


class SubtaskOut(OrmModel):
    id: uuid.UUID
    task_id: uuid.UUID
    title: str
    is_done: bool
    position: int
    created_at: datetime


class SubtaskCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=240)


class SubtaskUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    is_done: bool | None = None


class CommentOut(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author: UserBrief
    body: str
    created_at: datetime
    updated_at: datetime
    edited: bool


class CommentCreateIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class CommentUpdateIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class TaskCardOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    column_id: uuid.UUID
    number: int
    key: str
    title: str
    priority: Priority
    due_at: datetime | None = None
    position: float
    assignee: UserBrief | None = None
    labels: list[LabelOut]
    subtask_count: int
    subtask_done_count: int
    comment_count: int
    version: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class TaskDetailOut(TaskCardOut):
    description: str
    created_by: UserBrief
    subtasks: list[SubtaskOut]


class TaskCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=20000)
    column_id: uuid.UUID | None = None
    priority: Priority = "none"
    due_at: datetime | None = None
    assignee_id: uuid.UUID | None = None
    label_ids: list[uuid.UUID] | None = None


class TaskUpdateIn(BaseModel):
    version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=20000)
    priority: Priority | None = None
    due_at: datetime | None = None
    assignee_id: uuid.UUID | None = None
    label_ids: list[uuid.UUID] | None = None


class TaskMoveIn(BaseModel):
    column_id: uuid.UUID
    index: int = Field(ge=0)


class BoardColumnWithTasksOut(ColumnOut):
    tasks: list[TaskCardOut]


class BoardOut(BaseModel):
    project: ProjectDetailOut
    columns: list[BoardColumnWithTasksOut]
