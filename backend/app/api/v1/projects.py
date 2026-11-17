from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.realtime.events import dispatch_after_commit
from app.repositories.tenancy import get_project_with_membership
from app.schemas.activity import ActivityEventOut
from app.schemas.common import ColumnOut, CursorResponse, PageResponse, ProjectStatus
from app.schemas.project import (
    ColumnCreateIn,
    ColumnReorderIn,
    ColumnUpdateIn,
    ProjectCreateIn,
    ProjectDetailOut,
    ProjectMemberIn,
    ProjectSummaryOut,
    ProjectUpdateIn,
    SavedViewCreateIn,
    SavedViewOut,
)
from app.services import activity_service, project_service, task_service
from app.services.activity_service import RealtimeQueue

router = APIRouter(tags=["projects"])


@router.get(
    "/organizations/{org_id}/projects",
    response_model=PageResponse[ProjectSummaryOut],
    summary="List projects in workspace",
)
def list_projects(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: str | None = None,
    status_filter: ProjectStatus | None = Query(default=None, alias="status"),
    archived: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> PageResponse[ProjectSummaryOut]:
    return project_service.list_projects(
        db,
        org_id,
        user,
        q=q,
        status_filter=status_filter,
        archived=archived,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/organizations/{org_id}/projects",
    response_model=ProjectDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project with default Kanban columns",
)
def create_project(
    org_id: uuid.UUID,
    body: ProjectCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectDetailOut:
    rt_queue: RealtimeQueue = []
    res = project_service.create_project(db, org_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.get(
    "/projects/{project_id}",
    response_model=ProjectDetailOut,
    summary="Get project details",
)
def get_project(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectDetailOut:
    return project_service.get_project_detail(db, project_id, user)


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectDetailOut,
    summary="Update project settings",
)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectDetailOut:
    rt_queue: RealtimeQueue = []
    res = project_service.update_project(db, project_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.post(
    "/projects/{project_id}/archive",
    response_model=ProjectDetailOut,
    summary="Archive project",
)
def archive_project(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectDetailOut:
    rt_queue: RealtimeQueue = []
    res = project_service.set_project_archived(db, project_id, user, True, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.post(
    "/projects/{project_id}/unarchive",
    response_model=ProjectDetailOut,
    summary="Unarchive project",
)
def unarchive_project(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectDetailOut:
    rt_queue: RealtimeQueue = []
    res = project_service.set_project_archived(db, project_id, user, False, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete project (admin+)",
)
def delete_project(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    project_service.delete_project(db, project_id, user)


@router.post(
    "/projects/{project_id}/members",
    response_model=ProjectDetailOut,
    summary="Add or update project member role",
)
def upsert_project_member(
    project_id: uuid.UUID,
    body: ProjectMemberIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ProjectDetailOut:
    return project_service.upsert_project_member(db, project_id, user, body)


@router.delete(
    "/projects/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove project member",
)
def remove_project_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    project_service.remove_project_member(db, project_id, user_id, user)


@router.post(
    "/projects/{project_id}/columns",
    response_model=ColumnOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create board column",
)
def create_column(
    project_id: uuid.UUID,
    body: ColumnCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ColumnOut:
    rt_queue: RealtimeQueue = []
    res = project_service.create_column(db, project_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.patch(
    "/projects/{project_id}/columns/{column_id}",
    response_model=ColumnOut,
    summary="Update board column",
)
def update_column(
    project_id: uuid.UUID,
    column_id: uuid.UUID,
    body: ColumnUpdateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ColumnOut:
    rt_queue: RealtimeQueue = []
    res = project_service.update_column(db, project_id, column_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.delete(
    "/projects/{project_id}/columns/{column_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete board column",
)
def delete_column(
    project_id: uuid.UUID,
    column_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    move_to: uuid.UUID | None = None,
) -> None:
    rt_queue: RealtimeQueue = []
    project_service.delete_column(db, project_id, column_id, move_to, user, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)


@router.post(
    "/projects/{project_id}/columns/reorder",
    response_model=list[ColumnOut],
    summary="Reorder board columns",
)
def reorder_columns(
    project_id: uuid.UUID,
    body: ColumnReorderIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ColumnOut]:
    rt_queue: RealtimeQueue = []
    res = project_service.reorder_columns(db, project_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.get(
    "/projects/{project_id}/activity",
    response_model=CursorResponse[ActivityEventOut],
    summary="Project activity feed",
)
def project_activity(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
) -> CursorResponse[ActivityEventOut]:
    project, _, _ = get_project_with_membership(db, project_id, user.id)
    return activity_service.list_project_activity(db, project.id, cursor=cursor, limit=limit)


@router.get(
    "/projects/{project_id}/views",
    response_model=list[SavedViewOut],
    summary="List saved filter views for current user",
)
def list_views(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[SavedViewOut]:
    return task_service.list_saved_views(db, project_id, user)


@router.post(
    "/projects/{project_id}/views",
    response_model=SavedViewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Save a filter view",
)
def create_view(
    project_id: uuid.UUID,
    body: SavedViewCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SavedViewOut:
    return task_service.create_saved_view(db, project_id, user, body)


@router.delete(
    "/projects/{project_id}/views/{view_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a saved filter view",
)
def delete_view(
    project_id: uuid.UUID,
    view_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    task_service.delete_saved_view(db, project_id, view_id, user)
