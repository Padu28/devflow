from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError
from app.models.organization import Membership, Organization
from app.models.project import BoardColumn, Project, ProjectMember
from app.models.task import Comment, Subtask, Task

ORG_ROLE_RANK = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}


def get_org_membership(
    db: Session, org_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Organization, Membership]:
    row = db.execute(
        select(Organization, Membership)
        .join(Membership, Membership.organization_id == Organization.id)
        .where(Organization.id == org_id, Membership.user_id == user_id)
    ).first()
    if not row:
        raise NotFoundError("Organization not found")
    return row[0], row[1]


def require_org_role(membership: Membership, min_role: str) -> None:
    if ORG_ROLE_RANK.get(membership.role, -1) < ORG_ROLE_RANK[min_role]:
        raise ForbiddenError("Insufficient permissions for this action")


def get_project_with_membership(
    db: Session, project_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Project, Membership, ProjectMember | None]:
    row = db.execute(
        select(Project, Membership)
        .join(Membership, Membership.organization_id == Project.organization_id)
        .where(Project.id == project_id, Membership.user_id == user_id)
    ).first()
    if not row:
        raise NotFoundError("Project not found")
    project, membership = row[0], row[1]
    pm = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user_id,
        )
    )
    return project, membership, pm


def can_edit_project_tasks(membership: Membership) -> bool:
    return membership.role in ("owner", "admin", "member")


def can_manage_project(membership: Membership, pm: ProjectMember | None) -> bool:
    if membership.role in ("owner", "admin"):
        return True
    return membership.role == "member" and pm is not None and pm.project_role == "lead"


def require_task_write(membership: Membership) -> None:
    if not can_edit_project_tasks(membership):
        raise ForbiddenError("Viewers cannot modify tasks or comments")


def require_project_manage(membership: Membership, pm: ProjectMember | None) -> None:
    if not can_manage_project(membership, pm):
        raise ForbiddenError("Only project leads or organization admins can manage this project")


def get_task_with_access(
    db: Session,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
) -> tuple[Task, Project, Membership]:
    row = db.execute(
        select(Task, Project, Membership)
        .join(Project, Project.id == Task.project_id)
        .join(Membership, Membership.organization_id == Project.organization_id)
        .where(
            Task.id == task_id,
            Task.project_id == project_id,
            Membership.user_id == user_id,
        )
    ).first()
    if not row:
        raise NotFoundError("Task not found")
    return row[0], row[1], row[2]


def get_task_by_id_with_access(
    db: Session, task_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Task, Project, Membership]:
    row = db.execute(
        select(Task, Project, Membership)
        .join(Project, Project.id == Task.project_id)
        .join(Membership, Membership.organization_id == Project.organization_id)
        .where(Task.id == task_id, Membership.user_id == user_id)
    ).first()
    if not row:
        raise NotFoundError("Task not found")
    return row[0], row[1], row[2]


def get_column_in_project(db: Session, project_id: uuid.UUID, column_id: uuid.UUID) -> BoardColumn:
    col = db.scalar(
        select(BoardColumn).where(
            BoardColumn.id == column_id,
            BoardColumn.project_id == project_id,
        )
    )
    if not col:
        raise NotFoundError("Column not found")
    return col


def get_subtask_with_access(
    db: Session, task_id: uuid.UUID, subtask_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Subtask, Task, Project, Membership]:
    task, project, membership = get_task_by_id_with_access(db, task_id, user_id)
    sub = db.scalar(select(Subtask).where(Subtask.id == subtask_id, Subtask.task_id == task.id))
    if not sub:
        raise NotFoundError("Subtask not found")
    return sub, task, project, membership


def get_comment_with_access(
    db: Session, task_id: uuid.UUID, comment_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Comment, Task, Project, Membership]:
    task, project, membership = get_task_by_id_with_access(db, task_id, user_id)
    comment = db.scalar(select(Comment).where(Comment.id == comment_id, Comment.task_id == task.id))
    if not comment:
        raise NotFoundError("Comment not found")
    return comment, task, project, membership
