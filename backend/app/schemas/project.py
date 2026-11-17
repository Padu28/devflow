from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import ColumnOut, OrgRole, ProjectRole, ProjectStatus, UserBrief


class ProjectCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    key: str | None = Field(default=None, min_length=2, max_length=6, pattern=r"^[A-Z]{2,6}$")
    description: str = Field(default="", max_length=5000)
    color: str = Field(default="#C6F432", pattern=r"^#[0-9A-Fa-f]{6}$")
    member_ids: list[uuid.UUID] | None = None


class ProjectUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    status: ProjectStatus | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ProjectSummaryOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    key: str
    description: str
    status: ProjectStatus
    color: str
    archived_at: datetime | None = None
    created_by: UserBrief
    created_at: datetime
    updated_at: datetime
    task_count: int
    open_count: int
    done_count: int
    member_count: int
    members_preview: list[UserBrief]


class ProjectMemberIn(BaseModel):
    user_id: uuid.UUID
    project_role: ProjectRole = "contributor"


class ProjectMemberOut(BaseModel):
    user: UserBrief
    project_role: ProjectRole


class ProjectDetailOut(ProjectSummaryOut):
    columns: list[ColumnOut]
    members: list[ProjectMemberOut]
    my_org_role: OrgRole
    my_project_role: ProjectRole | None = None
    can_edit: bool
    can_manage: bool


class ColumnCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    wip_limit: int | None = Field(default=None, ge=1, le=500)
    is_done: bool = False


class ColumnUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    wip_limit: int | None = Field(default=None, ge=1, le=500)
    is_done: bool | None = None


class ColumnReorderIn(BaseModel):
    column_ids: list[uuid.UUID] = Field(min_length=1)


class SavedViewCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    filters: dict[str, Any] = Field(default_factory=dict)


class SavedViewOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    filters: dict[str, Any]
    created_at: datetime
