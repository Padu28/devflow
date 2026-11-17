from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")

Priority = Literal["urgent", "high", "medium", "low", "none"]
OrgRole = Literal["owner", "admin", "member", "viewer"]
InviteRole = Literal["admin", "member", "viewer"]
ProjectRole = Literal["lead", "contributor", "viewer"]
ProjectStatus = Literal["active", "paused", "completed"]


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserBrief(OrmModel):
    id: uuid.UUID
    email: str
    display_name: str
    avatar_color: str


class UserOut(UserBrief):
    created_at: datetime


class LabelOut(OrmModel):
    id: uuid.UUID
    name: str
    color: str


class ColumnOut(OrmModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    position: int
    color: str | None = None
    wip_limit: int | None = None
    is_done: bool


class PageResponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


class CursorResponse[T](BaseModel):
    items: list[T]
    next_cursor: str | None = None
