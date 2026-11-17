from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import InviteRole, OrgRole, UserBrief


class OrganizationCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")


class OrganizationUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class OrganizationBrief(BaseModel):
    id: uuid.UUID
    name: str
    slug: str


class OrganizationSummaryOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    role: OrgRole
    member_count: int
    project_count: int
    created_at: datetime


class MemberOut(BaseModel):
    user: UserBrief
    role: OrgRole
    joined_at: datetime


class MemberRoleUpdateIn(BaseModel):
    role: OrgRole


class InvitationCreateIn(BaseModel):
    email: EmailStr
    role: InviteRole = "member"


class InvitationOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    role: OrgRole
    status: Literal["pending", "accepted", "revoked", "expired"]
    invited_by: UserBrief
    expires_at: datetime
    created_at: datetime
    invite_url: str | None = None


class MyInvitationOut(BaseModel):
    id: uuid.UUID
    organization: OrganizationBrief
    role: OrgRole
    invited_by: UserBrief
    expires_at: datetime


class AcceptTokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=256)


class LabelCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


class LabelUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
