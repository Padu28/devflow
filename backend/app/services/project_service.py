from __future__ import annotations

import math
import re
import uuid
from typing import cast

from sqlalchemy import case, func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.db.base import utcnow
from app.models.organization import Membership
from app.models.project import BoardColumn, Project, ProjectMember
from app.models.task import Task
from app.models.user import User
from app.realtime.events import build_envelope
from app.repositories.tenancy import (
    can_edit_project_tasks,
    can_manage_project,
    get_org_membership,
    get_project_with_membership,
    require_org_role,
    require_project_manage,
)
from app.schemas.common import ColumnOut, OrgRole, PageResponse, ProjectRole, ProjectStatus
from app.schemas.project import (
    ColumnCreateIn,
    ColumnReorderIn,
    ColumnUpdateIn,
    ProjectCreateIn,
    ProjectDetailOut,
    ProjectMemberIn,
    ProjectMemberOut,
    ProjectSummaryOut,
    ProjectUpdateIn,
)
from app.services.activity_service import RealtimeQueue, record_activity, to_user_brief

DEFAULT_COLUMNS = [
    ("Backlog", "#71717A", False),
    ("To Do", "#38BDF8", False),
    ("In Progress", "#FACC15", False),
    ("In Review", "#A78BFA", False),
    ("Done", "#10B981", True),
]


def _derive_project_key(name: str) -> str:
    letters = re.sub(r"[^A-Za-z]", "", name).upper()
    if len(letters) >= 3:
        return letters[:3]
    if len(letters) >= 2:
        return letters
    return "PRJ"


def _unique_project_key(db: Session, org_id: uuid.UUID, base_key: str) -> str:
    candidate = base_key[:6]
    if (
        db.scalar(
            select(Project.id).where(Project.organization_id == org_id, Project.key == candidate)
        )
        is None
    ):
        return candidate
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        alt = f"{base_key[:5]}{ch}"
        if (
            db.scalar(
                select(Project.id).where(Project.organization_id == org_id, Project.key == alt)
            )
            is None
        ):
            return alt
    return f"P{uuid.uuid4().hex[:5].upper()}"


def build_project_summaries(db: Session, projects: list[Project]) -> list[ProjectSummaryOut]:
    if not projects:
        return []
    pids = [p.id for p in projects]

    task_stats_rows = db.execute(
        select(
            Task.project_id,
            func.count(Task.id),
            func.sum(case((Task.completed_at.is_(None), 1), else_=0)),
            func.sum(case((Task.completed_at.is_not(None), 1), else_=0)),
        )
        .where(Task.project_id.in_(pids))
        .group_by(Task.project_id)
    ).all()
    task_stats = {r[0]: (int(r[1] or 0), int(r[2] or 0), int(r[3] or 0)) for r in task_stats_rows}

    pm_rows = db.scalars(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id.in_(pids))
    ).all()
    members_by_proj: dict[uuid.UUID, list[ProjectMember]] = {}
    for pm in pm_rows:
        members_by_proj.setdefault(pm.project_id, []).append(pm)

    result: list[ProjectSummaryOut] = []
    for p in projects:
        total_t, open_t, done_t = task_stats.get(p.id, (0, 0, 0))
        pms = members_by_proj.get(p.id, [])
        result.append(
            ProjectSummaryOut(
                id=p.id,
                organization_id=p.organization_id,
                name=p.name,
                key=p.key,
                description=p.description,
                status=cast(ProjectStatus, p.status),
                color=p.color,
                archived_at=p.archived_at,
                created_by=to_user_brief(p.creator),
                created_at=p.created_at,
                updated_at=p.updated_at,
                task_count=total_t,
                open_count=open_t,
                done_count=done_t,
                member_count=len(pms),
                members_preview=[to_user_brief(pm.user) for pm in pms[:5]],
            )
        )
    return result


def build_project_detail(
    db: Session,
    project: Project,
    membership: Membership,
    pm: ProjectMember | None,
) -> ProjectDetailOut:
    summary = build_project_summaries(db, [project])[0]
    cols = db.scalars(
        select(BoardColumn)
        .where(BoardColumn.project_id == project.id)
        .order_by(BoardColumn.position.asc())
    ).all()
    pms = db.scalars(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project.id)
    ).all()
    return ProjectDetailOut(
        **summary.model_dump(),
        columns=[ColumnOut.model_validate(c) for c in cols],
        members=[
            ProjectMemberOut(
                user=to_user_brief(m.user),
                project_role=cast(ProjectRole, m.project_role),
            )
            for m in pms
        ],
        my_org_role=cast(OrgRole, membership.role),
        my_project_role=cast(ProjectRole, pm.project_role) if pm else None,
        can_edit=can_edit_project_tasks(membership),
        can_manage=can_manage_project(membership, pm),
    )


def list_projects(
    db: Session,
    org_id: uuid.UUID,
    user: User,
    q: str | None = None,
    status_filter: str | None = None,
    archived: bool = False,
    page: int = 1,
    page_size: int = 25,
) -> PageResponse[ProjectSummaryOut]:
    get_org_membership(db, org_id, user.id)
    stmt = (
        select(Project)
        .options(selectinload(Project.creator))
        .where(Project.organization_id == org_id)
    )
    if archived:
        stmt = stmt.where(Project.archived_at.is_not(None))
    else:
        stmt = stmt.where(Project.archived_at.is_(None))
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    if q and q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(Project.name.ilike(pat), Project.key.ilike(pat), Project.description.ilike(pat))
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Project.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = build_project_summaries(db, list(rows))
    pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    return PageResponse(items=items, total=total, page=page, page_size=page_size, pages=pages)


def create_project(
    db: Session,
    org_id: uuid.UUID,
    user: User,
    data: ProjectCreateIn,
    rt_queue: RealtimeQueue | None = None,
) -> ProjectDetailOut:
    _, membership = get_org_membership(db, org_id, user.id)
    require_org_role(membership, "member")
    name = data.name.strip()
    if not name:
        raise BadRequestError("Project name cannot be blank")

    if data.key:
        dup = db.scalar(
            select(Project.id).where(Project.organization_id == org_id, Project.key == data.key)
        )
        if dup:
            raise ConflictError("Project key already exists in this workspace")
        key = data.key
    else:
        key = _unique_project_key(db, org_id, _derive_project_key(name))

    project = Project(
        organization_id=org_id,
        name=name,
        key=key,
        description=data.description.strip(),
        color=data.color,
        created_by=user.id,
    )
    db.add(project)
    db.flush()

    creator_pm = ProjectMember(project_id=project.id, user_id=user.id, project_role="lead")
    db.add(creator_pm)

    if data.member_ids:
        valid_ids = set(
            db.scalars(
                select(Membership.user_id).where(
                    Membership.organization_id == org_id,
                    Membership.user_id.in_(data.member_ids),
                )
            ).all()
        )
        for uid in valid_ids:
            if uid != user.id:
                db.add(
                    ProjectMember(project_id=project.id, user_id=uid, project_role="contributor")
                )

    for idx, (col_name, col_color, is_done) in enumerate(DEFAULT_COLUMNS):
        db.add(
            BoardColumn(
                project_id=project.id,
                name=col_name,
                position=idx,
                color=col_color,
                is_done=is_done,
            )
        )

    record_activity(
        db,
        organization_id=org_id,
        project_id=project.id,
        actor_id=user.id,
        entity_type="project",
        entity_id=project.id,
        action="project.created",
        metadata={"project_name": project.name, "project_key": project.key},
    )
    if rt_queue is not None:
        rt_queue.append(
            (
                org_id,
                build_envelope(
                    "project.updated",
                    tenant_id=org_id,
                    actor_id=user.id,
                    entity_id=project.id,
                    project_id=project.id,
                    payload={"project_id": str(project.id)},
                ),
                None,
            )
        )

    db.commit()
    db.refresh(project)
    project.creator = user
    return build_project_detail(db, project, membership, creator_pm)


def get_project_detail(db: Session, project_id: uuid.UUID, user: User) -> ProjectDetailOut:
    project, membership, pm = get_project_with_membership(db, project_id, user.id)
    return build_project_detail(db, project, membership, pm)


def update_project(
    db: Session,
    project_id: uuid.UUID,
    user: User,
    data: ProjectUpdateIn,
    rt_queue: RealtimeQueue | None = None,
) -> ProjectDetailOut:
    project, membership, pm = get_project_with_membership(db, project_id, user.id)
    require_project_manage(membership, pm)

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise BadRequestError("Project name cannot be blank")
        project.name = name
    if data.description is not None:
        project.description = data.description
    if data.status is not None:
        project.status = data.status
    if data.color is not None:
        project.color = data.color

    record_activity(
        db,
        organization_id=project.organization_id,
        project_id=project.id,
        actor_id=user.id,
        entity_type="project",
        entity_id=project.id,
        action="project.updated",
        metadata={"project_name": project.name},
    )
    if rt_queue is not None:
        rt_queue.append(
            (
                project.organization_id,
                build_envelope(
                    "project.updated",
                    tenant_id=project.organization_id,
                    actor_id=user.id,
                    entity_id=project.id,
                    project_id=project.id,
                    payload={"project_id": str(project.id)},
                ),
                None,
            )
        )
    db.commit()
    db.refresh(project)
    return build_project_detail(db, project, membership, pm)


def set_project_archived(
    db: Session,
    project_id: uuid.UUID,
    user: User,
    archived: bool,
    rt_queue: RealtimeQueue | None = None,
) -> ProjectDetailOut:
    project, membership, pm = get_project_with_membership(db, project_id, user.id)
    require_project_manage(membership, pm)
    project.archived_at = utcnow() if archived else None
    action = "project.archived" if archived else "project.unarchived"
    record_activity(
        db,
        organization_id=project.organization_id,
        project_id=project.id,
        actor_id=user.id,
        entity_type="project",
        entity_id=project.id,
        action=action,
        metadata={"project_name": project.name},
    )
    if rt_queue is not None:
        rt_queue.append(
            (
                project.organization_id,
                build_envelope(
                    "project.updated",
                    tenant_id=project.organization_id,
                    actor_id=user.id,
                    entity_id=project.id,
                    project_id=project.id,
                    payload={"project_id": str(project.id)},
                ),
                None,
            )
        )
    db.commit()
    db.refresh(project)
    return build_project_detail(db, project, membership, pm)


def delete_project(db: Session, project_id: uuid.UUID, user: User) -> None:
    project, membership, _ = get_project_with_membership(db, project_id, user.id)
    require_org_role(membership, "admin")
    db.delete(project)
    db.commit()


def upsert_project_member(
    db: Session, project_id: uuid.UUID, actor: User, data: ProjectMemberIn
) -> ProjectDetailOut:
    project, membership, pm = get_project_with_membership(db, project_id, actor.id)
    require_project_manage(membership, pm)

    is_org_member = db.scalar(
        select(Membership.id).where(
            Membership.organization_id == project.organization_id,
            Membership.user_id == data.user_id,
        )
    )
    if not is_org_member:
        raise BadRequestError("User must be a member of the workspace first")

    existing = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == data.user_id,
        )
    )
    if existing:
        existing.project_role = data.project_role
    else:
        db.add(
            ProjectMember(
                project_id=project.id,
                user_id=data.user_id,
                project_role=data.project_role,
            )
        )
    db.commit()
    return build_project_detail(db, project, membership, pm)


def remove_project_member(
    db: Session, project_id: uuid.UUID, target_user_id: uuid.UUID, actor: User
) -> None:
    project, membership, pm = get_project_with_membership(db, project_id, actor.id)
    require_project_manage(membership, pm)
    target = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == target_user_id,
        )
    )
    if not target:
        raise NotFoundError("Project member not found")
    db.delete(target)
    db.commit()


def _emit_columns_updated(
    rt_queue: RealtimeQueue | None, project: Project, actor_id: uuid.UUID
) -> None:
    if rt_queue is not None:
        rt_queue.append(
            (
                project.organization_id,
                build_envelope(
                    "columns.updated",
                    tenant_id=project.organization_id,
                    actor_id=actor_id,
                    entity_id=project.id,
                    project_id=project.id,
                    payload={"project_id": str(project.id)},
                ),
                None,
            )
        )


def create_column(
    db: Session,
    project_id: uuid.UUID,
    user: User,
    data: ColumnCreateIn,
    rt_queue: RealtimeQueue | None = None,
) -> ColumnOut:
    project, membership, pm = get_project_with_membership(db, project_id, user.id)
    require_project_manage(membership, pm)
    max_pos = db.scalar(
        select(func.max(BoardColumn.position)).where(BoardColumn.project_id == project.id)
    )
    next_pos = 0 if max_pos is None else int(max_pos) + 1
    col = BoardColumn(
        project_id=project.id,
        name=data.name.strip(),
        position=next_pos,
        color=data.color,
        wip_limit=data.wip_limit,
        is_done=data.is_done,
    )
    db.add(col)
    _emit_columns_updated(rt_queue, project, user.id)
    db.commit()
    db.refresh(col)
    return ColumnOut.model_validate(col)


def update_column(
    db: Session,
    project_id: uuid.UUID,
    column_id: uuid.UUID,
    user: User,
    data: ColumnUpdateIn,
    rt_queue: RealtimeQueue | None = None,
) -> ColumnOut:
    project, membership, pm = get_project_with_membership(db, project_id, user.id)
    require_project_manage(membership, pm)
    col = db.scalar(
        select(BoardColumn).where(BoardColumn.id == column_id, BoardColumn.project_id == project.id)
    )
    if not col:
        raise NotFoundError("Column not found")
    fields = data.model_fields_set
    if "name" in fields and data.name is not None:
        col.name = data.name.strip()
    if "color" in fields:
        col.color = data.color
    if "wip_limit" in fields:
        col.wip_limit = data.wip_limit
    if "is_done" in fields and data.is_done is not None:
        col.is_done = data.is_done
    _emit_columns_updated(rt_queue, project, user.id)
    db.commit()
    db.refresh(col)
    return ColumnOut.model_validate(col)


def delete_column(
    db: Session,
    project_id: uuid.UUID,
    column_id: uuid.UUID,
    move_to: uuid.UUID | None,
    user: User,
    rt_queue: RealtimeQueue | None = None,
) -> None:
    project, membership, pm = get_project_with_membership(db, project_id, user.id)
    require_project_manage(membership, pm)
    col = db.scalar(
        select(BoardColumn).where(BoardColumn.id == column_id, BoardColumn.project_id == project.id)
    )
    if not col:
        raise NotFoundError("Column not found")

    task_count = db.scalar(select(func.count(Task.id)).where(Task.column_id == col.id)) or 0
    if task_count > 0:
        if not move_to or move_to == col.id:
            raise BadRequestError("Column contains tasks; provide a valid move_to column id")
        target_col = db.scalar(
            select(BoardColumn).where(
                BoardColumn.id == move_to, BoardColumn.project_id == project.id
            )
        )
        if not target_col:
            raise NotFoundError("Target column not found")
        db.execute(update(Task).where(Task.column_id == col.id).values(column_id=target_col.id))

    db.delete(col)
    _emit_columns_updated(rt_queue, project, user.id)
    db.commit()


def reorder_columns(
    db: Session,
    project_id: uuid.UUID,
    user: User,
    data: ColumnReorderIn,
    rt_queue: RealtimeQueue | None = None,
) -> list[ColumnOut]:
    project, membership, pm = get_project_with_membership(db, project_id, user.id)
    require_project_manage(membership, pm)
    cols = db.scalars(select(BoardColumn).where(BoardColumn.project_id == project.id)).all()
    col_map = {c.id: c for c in cols}
    if set(data.column_ids) != set(col_map.keys()) or len(data.column_ids) != len(cols):
        raise BadRequestError("column_ids must contain every column in the project exactly once")
    for idx, cid in enumerate(data.column_ids):
        col_map[cid].position = idx
    _emit_columns_updated(rt_queue, project, user.id)
    db.commit()
    ordered = sorted(cols, key=lambda c: c.position)
    return [ColumnOut.model_validate(c) for c in ordered]
