from __future__ import annotations

import contextlib
import uuid
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.realtime.manager import manager
from app.repositories.tenancy import get_org_membership
from app.schemas.activity import ActivityEventOut, AnalyticsOverviewOut, SearchOut
from app.schemas.common import CursorResponse, LabelOut
from app.schemas.organization import (
    LabelCreateIn,
    LabelUpdateIn,
    MemberOut,
    MemberRoleUpdateIn,
    OrganizationCreateIn,
    OrganizationSummaryOut,
    OrganizationUpdateIn,
)
from app.services import activity_service, analytics_service, org_service, search_service

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationSummaryOut], summary="List my organizations")
def list_orgs(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[OrganizationSummaryOut]:
    return org_service.list_user_organizations(db, user)


@router.post(
    "",
    response_model=OrganizationSummaryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
)
def create_org(
    body: OrganizationCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> OrganizationSummaryOut:
    return org_service.create_organization(db, user, body)


@router.get("/{org_id}", response_model=OrganizationSummaryOut, summary="Get organization summary")
def get_org(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> OrganizationSummaryOut:
    return org_service.get_organization_summary(db, org_id, user)


@router.patch("/{org_id}", response_model=OrganizationSummaryOut, summary="Rename organization")
def update_org(
    org_id: uuid.UUID,
    body: OrganizationUpdateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> OrganizationSummaryOut:
    return org_service.update_organization(db, org_id, user, body)


@router.delete(
    "/{org_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete organization (owner only)",
)
def delete_org(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    org_service.delete_organization(db, org_id, user)


@router.get("/{org_id}/members", response_model=list[MemberOut], summary="List workspace members")
def list_members(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[MemberOut]:
    return org_service.list_members(db, org_id, user)


@router.patch(
    "/{org_id}/members/{user_id}",
    response_model=MemberOut,
    summary="Update member role",
)
def update_member_role(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    body: MemberRoleUpdateIn,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MemberOut:
    return org_service.update_member_role(db, org_id, user_id, body.role, actor)


@router.delete(
    "/{org_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove member or leave workspace",
)
def remove_member(
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    org_service.remove_member(db, org_id, user_id, actor)
    with contextlib.suppress(RuntimeError):
        anyio.from_thread.run(manager.revoke_user, org_id, user_id)


@router.get("/{org_id}/labels", response_model=list[LabelOut], summary="List workspace labels")
def list_labels(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[LabelOut]:
    return org_service.list_labels(db, org_id, user)


@router.post(
    "/{org_id}/labels",
    response_model=LabelOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create workspace label",
)
def create_label(
    org_id: uuid.UUID,
    body: LabelCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LabelOut:
    return org_service.create_label(db, org_id, user, body)


@router.patch("/{org_id}/labels/{label_id}", response_model=LabelOut, summary="Update label")
def update_label(
    org_id: uuid.UUID,
    label_id: uuid.UUID,
    body: LabelUpdateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LabelOut:
    return org_service.update_label(db, org_id, label_id, user, body)


@router.delete(
    "/{org_id}/labels/{label_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete label",
)
def delete_label(
    org_id: uuid.UUID,
    label_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    org_service.delete_label(db, org_id, label_id, user)


@router.get("/{org_id}/search", response_model=SearchOut, summary="Search tasks and projects")
def search(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: str = Query(min_length=1, max_length=120),
    limit: int = Query(default=8, ge=1, le=20),
) -> SearchOut:
    return search_service.search_workspace(db, org_id, user, q=q, limit=limit)


@router.get(
    "/{org_id}/activity",
    response_model=CursorResponse[ActivityEventOut],
    summary="Workspace activity feed",
)
def org_activity(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
) -> CursorResponse[ActivityEventOut]:
    get_org_membership(db, org_id, user.id)
    return activity_service.list_org_activity(db, org_id, cursor=cursor, limit=limit)


@router.get(
    "/{org_id}/analytics/overview",
    response_model=AnalyticsOverviewOut,
    summary="Workspace analytics overview",
)
def analytics_overview(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    project_id: uuid.UUID | None = None,
    days: int = Query(default=30, ge=7, le=90),
) -> AnalyticsOverviewOut:
    return analytics_service.get_analytics_overview(
        db, org_id, user, project_id=project_id, days=days
    )
