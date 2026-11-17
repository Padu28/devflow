from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.realtime.events import dispatch_after_commit
from app.schemas.common import CursorResponse, PageResponse, Priority
from app.schemas.task import (
    BoardOut,
    CommentCreateIn,
    CommentOut,
    CommentUpdateIn,
    SubtaskCreateIn,
    SubtaskOut,
    SubtaskUpdateIn,
    TaskCardOut,
    TaskCreateIn,
    TaskDetailOut,
    TaskMoveIn,
    TaskUpdateIn,
)
from app.services import task_service
from app.services.activity_service import RealtimeQueue

router = APIRouter(tags=["tasks"])


@router.get("/projects/{project_id}/board", response_model=BoardOut, summary="Load project board")
def get_board(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: str | None = None,
    assignee_id: str | None = None,
    priority: Priority | None = None,
    label_id: uuid.UUID | None = None,
    due: str | None = None,
) -> BoardOut:
    return task_service.get_board(
        db,
        project_id,
        user,
        q=q,
        assignee_id=assignee_id,
        priority=priority,
        label_id=label_id,
        due=due,
    )


@router.get(
    "/projects/{project_id}/tasks",
    response_model=PageResponse[TaskCardOut],
    summary="List project tasks with filtering and sorting",
)
def list_tasks(
    project_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: str | None = None,
    assignee_id: str | None = None,
    priority: Priority | None = None,
    label_id: uuid.UUID | None = None,
    due: str | None = None,
    column_id: uuid.UUID | None = None,
    sort: str = "-updated_at",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> PageResponse[TaskCardOut]:
    return task_service.list_tasks(
        db,
        project_id,
        user,
        q=q,
        assignee_id=assignee_id,
        priority=priority,
        label_id=label_id,
        due=due,
        column_id=column_id,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/projects/{project_id}/tasks",
    response_model=TaskDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new task",
)
def create_task(
    project_id: uuid.UUID,
    body: TaskCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskDetailOut:
    rt_queue: RealtimeQueue = []
    res = task_service.create_task(db, project_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.get(
    "/projects/{project_id}/tasks/{task_id}",
    response_model=TaskDetailOut,
    summary="Get task details",
)
def get_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskDetailOut:
    return task_service.get_task_detail(db, project_id, task_id, user)


@router.patch(
    "/projects/{project_id}/tasks/{task_id}",
    response_model=TaskDetailOut,
    summary="Update task fields with optimistic concurrency version check",
)
def update_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskDetailOut:
    rt_queue: RealtimeQueue = []
    res = task_service.update_task(db, project_id, task_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.post(
    "/projects/{project_id}/tasks/{task_id}/move",
    response_model=TaskCardOut,
    summary="Move task to a column and target index",
)
def move_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskMoveIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TaskCardOut:
    rt_queue: RealtimeQueue = []
    res = task_service.move_task(db, project_id, task_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.delete(
    "/projects/{project_id}/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task",
)
def delete_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    rt_queue: RealtimeQueue = []
    task_service.delete_task(db, project_id, task_id, user, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)


@router.post(
    "/tasks/{task_id}/subtasks",
    response_model=SubtaskOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add subtask",
)
def create_subtask(
    task_id: uuid.UUID,
    body: SubtaskCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SubtaskOut:
    return task_service.create_subtask(db, task_id, user, body)


@router.patch(
    "/tasks/{task_id}/subtasks/{subtask_id}",
    response_model=SubtaskOut,
    summary="Update subtask",
)
def update_subtask(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    body: SubtaskUpdateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SubtaskOut:
    return task_service.update_subtask(db, task_id, subtask_id, user, body)


@router.delete(
    "/tasks/{task_id}/subtasks/{subtask_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete subtask",
)
def delete_subtask(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    task_service.delete_subtask(db, task_id, subtask_id, user)


@router.get(
    "/tasks/{task_id}/comments",
    response_model=CursorResponse[CommentOut],
    summary="List task comments (oldest to newest)",
)
def list_comments(
    task_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
) -> CursorResponse[CommentOut]:
    return task_service.list_comments(db, task_id, user, cursor=cursor, limit=limit)


@router.post(
    "/tasks/{task_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add comment to task",
)
def create_comment(
    task_id: uuid.UUID,
    body: CommentCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CommentOut:
    rt_queue: RealtimeQueue = []
    res = task_service.create_comment(db, task_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.patch(
    "/tasks/{task_id}/comments/{comment_id}",
    response_model=CommentOut,
    summary="Edit own comment",
)
def update_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    body: CommentUpdateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> CommentOut:
    return task_service.update_comment(db, task_id, comment_id, user, body)


@router.delete(
    "/tasks/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete comment (author or admin+)",
)
def delete_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    task_service.delete_comment(db, task_id, comment_id, user)
