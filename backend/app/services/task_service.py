from __future__ import annotations

import math
import uuid
from datetime import timedelta
from typing import Any, cast

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.db.base import utcnow
from app.models.organization import Membership
from app.models.project import BoardColumn, Label, Project, SavedView
from app.models.task import Comment, Subtask, Task, TaskLabel
from app.models.user import User
from app.realtime.events import build_envelope
from app.repositories.tenancy import (
    get_column_in_project,
    get_comment_with_access,
    get_project_with_membership,
    get_subtask_with_access,
    get_task_by_id_with_access,
    get_task_with_access,
    require_org_role,
    require_task_write,
)
from app.schemas.common import ColumnOut, CursorResponse, LabelOut, PageResponse, Priority
from app.schemas.project import SavedViewCreateIn, SavedViewOut
from app.schemas.task import (
    BoardColumnWithTasksOut,
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
from app.services.activity_service import (
    RealtimeQueue,
    decode_cursor,
    encode_cursor,
    notify_users,
    record_activity,
    to_user_brief,
)
from app.services.project_service import build_project_detail

POSITION_STEP = 1024.0
REBALANCE_EPSILON = 1e-6


def _apply_task_filters(
    stmt: Select[Any],
    *,
    current_user_id: uuid.UUID,
    q: str | None = None,
    assignee_id: str | None = None,
    priority: str | None = None,
    label_id: uuid.UUID | None = None,
    due: str | None = None,
) -> Select[Any]:
    if q and q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(or_(Task.title.ilike(pat), Task.description.ilike(pat)))
    if assignee_id:
        if assignee_id == "me":
            stmt = stmt.where(Task.assignee_id == current_user_id)
        elif assignee_id == "none":
            stmt = stmt.where(Task.assignee_id.is_(None))
        else:
            try:
                stmt = stmt.where(Task.assignee_id == uuid.UUID(assignee_id))
            except ValueError as exc:
                raise BadRequestError("Invalid assignee_id filter") from exc
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if label_id:
        stmt = stmt.where(
            Task.id.in_(select(TaskLabel.task_id).where(TaskLabel.label_id == label_id))
        )
    if due:
        now = utcnow()
        if due == "overdue":
            stmt = stmt.where(
                Task.due_at.is_not(None), Task.due_at < now, Task.completed_at.is_(None)
            )
        elif due == "this_week":
            stmt = stmt.where(
                Task.due_at.is_not(None),
                Task.due_at >= now,
                Task.due_at <= now + timedelta(days=7),
            )
        elif due == "none":
            stmt = stmt.where(Task.due_at.is_(None))
    return stmt


def _task_counts_maps(
    db: Session, task_ids: list[uuid.UUID]
) -> tuple[dict[uuid.UUID, tuple[int, int]], dict[uuid.UUID, int]]:
    if not task_ids:
        return {}, {}
    sub_rows = db.execute(
        select(
            Subtask.task_id,
            func.count(Subtask.id),
            func.sum(case((Subtask.is_done.is_(True), 1), else_=0)),
        )
        .where(Subtask.task_id.in_(task_ids))
        .group_by(Subtask.task_id)
    ).all()
    sub_map = {r[0]: (int(r[1] or 0), int(r[2] or 0)) for r in sub_rows}

    com_rows = db.execute(
        select(Comment.task_id, func.count(Comment.id))
        .where(Comment.task_id.in_(task_ids))
        .group_by(Comment.task_id)
    ).all()
    com_map = {r[0]: int(r[1] or 0) for r in com_rows}
    return sub_map, com_map


def serialize_task_cards(db: Session, tasks: list[Task], project_key: str) -> list[TaskCardOut]:
    if not tasks:
        return []
    sub_map, com_map = _task_counts_maps(db, [t.id for t in tasks])
    out: list[TaskCardOut] = []
    for t in tasks:
        sub_total, sub_done = sub_map.get(t.id, (0, 0))
        out.append(
            TaskCardOut(
                id=t.id,
                project_id=t.project_id,
                column_id=t.column_id,
                number=t.number,
                key=f"{project_key}-{t.number}",
                title=t.title,
                priority=cast(Priority, t.priority),
                due_at=t.due_at,
                position=t.position,
                assignee=to_user_brief(t.assignee) if t.assignee else None,
                labels=[LabelOut.model_validate(lb) for lb in t.labels],
                subtask_count=sub_total,
                subtask_done_count=sub_done,
                comment_count=com_map.get(t.id, 0),
                version=t.version,
                created_at=t.created_at,
                updated_at=t.updated_at,
                completed_at=t.completed_at,
            )
        )
    return out


def _serialize_task_detail(db: Session, task: Task, project_key: str) -> TaskDetailOut:
    card = serialize_task_cards(db, [task], project_key)[0]
    subtasks = db.scalars(
        select(Subtask).where(Subtask.task_id == task.id).order_by(Subtask.position.asc())
    ).all()
    return TaskDetailOut(
        **card.model_dump(),
        description=task.description,
        created_by=to_user_brief(task.creator),
        subtasks=[SubtaskOut.model_validate(s) for s in subtasks],
    )


def get_board(
    db: Session,
    project_id: uuid.UUID,
    user: User,
    *,
    q: str | None = None,
    assignee_id: str | None = None,
    priority: str | None = None,
    label_id: uuid.UUID | None = None,
    due: str | None = None,
) -> BoardOut:
    project, membership, pm = get_project_with_membership(db, project_id, user.id)
    project_detail = build_project_detail(db, project, membership, pm)

    stmt = (
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.labels))
        .where(Task.project_id == project.id)
    )
    stmt = _apply_task_filters(
        stmt,
        current_user_id=user.id,
        q=q,
        assignee_id=assignee_id,
        priority=priority,
        label_id=label_id,
        due=due,
    )
    tasks = list(db.scalars(stmt.order_by(Task.position.asc(), Task.created_at.asc())).all())
    cards = serialize_task_cards(db, tasks, project.key)
    cards_by_col: dict[uuid.UUID, list[TaskCardOut]] = {}
    for c in cards:
        cards_by_col.setdefault(c.column_id, []).append(c)

    board_cols = [
        BoardColumnWithTasksOut(
            **ColumnOut.model_validate(col).model_dump(),
            tasks=cards_by_col.get(col.id, []),
        )
        for col in project_detail.columns
    ]
    return BoardOut(project=project_detail, columns=board_cols)


def list_tasks(
    db: Session,
    project_id: uuid.UUID,
    user: User,
    *,
    q: str | None = None,
    assignee_id: str | None = None,
    priority: str | None = None,
    label_id: uuid.UUID | None = None,
    due: str | None = None,
    column_id: uuid.UUID | None = None,
    sort: str = "-updated_at",
    page: int = 1,
    page_size: int = 25,
) -> PageResponse[TaskCardOut]:
    project, _, _ = get_project_with_membership(db, project_id, user.id)
    stmt = (
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.labels))
        .where(Task.project_id == project.id)
    )
    if column_id:
        stmt = stmt.where(Task.column_id == column_id)
    stmt = _apply_task_filters(
        stmt,
        current_user_id=user.id,
        q=q,
        assignee_id=assignee_id,
        priority=priority,
        label_id=label_id,
        due=due,
    )

    priority_rank = case(
        (Task.priority == "urgent", 0),
        (Task.priority == "high", 1),
        (Task.priority == "medium", 2),
        (Task.priority == "low", 3),
        else_=4,
    )
    sort_map: dict[str, Any] = {
        "position": Task.position.asc(),
        "created_at": Task.created_at.asc(),
        "-created_at": Task.created_at.desc(),
        "due_at": Task.due_at.asc(),
        "-due_at": Task.due_at.desc(),
        "priority": priority_rank.asc(),
        "-updated_at": Task.updated_at.desc(),
    }
    order_expr = sort_map.get(sort, Task.updated_at.desc())

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(order_expr, Task.id.asc()).offset((page - 1) * page_size).limit(page_size)
        ).all()
    )
    items = serialize_task_cards(db, rows, project.key)
    pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    return PageResponse(items=items, total=total, page=page, page_size=page_size, pages=pages)


def _validate_assignee_in_org(
    db: Session, org_id: uuid.UUID, assignee_id: uuid.UUID | None
) -> User | None:
    if assignee_id is None:
        return None
    row = db.execute(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.organization_id == org_id, User.id == assignee_id)
    ).first()
    if not row:
        raise BadRequestError("Assignee must be a member of the workspace")
    return row[0]


def _validate_labels_in_org(
    db: Session, org_id: uuid.UUID, label_ids: list[uuid.UUID] | None
) -> list[Label]:
    if not label_ids:
        return []
    labels = list(
        db.scalars(
            select(Label).where(Label.organization_id == org_id, Label.id.in_(label_ids))
        ).all()
    )
    if len(labels) != len(set(label_ids)):
        raise BadRequestError("One or more labels do not belong to this workspace")
    return labels


def create_task(
    db: Session,
    project_id: uuid.UUID,
    actor: User,
    data: TaskCreateIn,
    rt_queue: RealtimeQueue | None = None,
) -> TaskDetailOut:
    project, membership, _ = get_project_with_membership(db, project_id, actor.id)
    require_task_write(membership)

    if data.column_id:
        col = get_column_in_project(db, project.id, data.column_id)
    else:
        found_col = db.scalar(
            select(BoardColumn)
            .where(BoardColumn.project_id == project.id, BoardColumn.is_done.is_(False))
            .order_by(BoardColumn.position.asc())
        ) or db.scalar(
            select(BoardColumn)
            .where(BoardColumn.project_id == project.id)
            .order_by(BoardColumn.position.asc())
        )
        if not found_col:
            raise BadRequestError("Project has no columns")
        col = found_col

    assignee = _validate_assignee_in_org(db, project.organization_id, data.assignee_id)
    labels = _validate_labels_in_org(db, project.organization_id, data.label_ids)

    # Atomic increment of project task counter
    locked_proj = db.scalar(select(Project).where(Project.id == project.id).with_for_update())
    assert locked_proj is not None
    locked_proj.task_counter += 1
    task_number = locked_proj.task_counter
    locked_proj.updated_at = utcnow()

    max_pos = db.scalar(select(func.max(Task.position)).where(Task.column_id == col.id))
    pos = POSITION_STEP if max_pos is None else float(max_pos) + POSITION_STEP

    now = utcnow()
    task = Task(
        project_id=project.id,
        column_id=col.id,
        number=task_number,
        title=data.title.strip(),
        description=data.description,
        priority=data.priority,
        due_at=data.due_at,
        position=pos,
        created_by=actor.id,
        assignee_id=assignee.id if assignee else None,
        completed_at=now if col.is_done else None,
    )
    task.labels = labels
    db.add(task)
    db.flush()

    task_key = f"{project.key}-{task.number}"
    ev = record_activity(
        db,
        organization_id=project.organization_id,
        project_id=project.id,
        actor_id=actor.id,
        entity_type="task",
        entity_id=task.id,
        action="task.created",
        metadata={"task_key": task_key, "task_title": task.title, "column": col.name},
    )
    if assignee:
        notify_users(
            db,
            event=ev,
            actor=actor,
            recipient_ids={assignee.id},
            pref_field="on_assigned",
            rt_queue=rt_queue,
        )

    db.commit()
    db.refresh(task)
    detail = _serialize_task_detail(db, task, project.key)
    card = TaskCardOut(**{k: getattr(detail, k) for k in TaskCardOut.model_fields})
    if rt_queue is not None:
        rt_queue.append(
            (
                project.organization_id,
                build_envelope(
                    "task.created",
                    tenant_id=project.organization_id,
                    actor_id=actor.id,
                    entity_id=task.id,
                    project_id=project.id,
                    payload={"task": card.model_dump(mode="json")},
                ),
                None,
            )
        )
    return detail


def get_task_detail(
    db: Session, project_id: uuid.UUID, task_id: uuid.UUID, user: User
) -> TaskDetailOut:
    task, project, _ = get_task_with_access(db, project_id, task_id, user.id)
    return _serialize_task_detail(db, task, project.key)


def update_task(
    db: Session,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    actor: User,
    data: TaskUpdateIn,
    rt_queue: RealtimeQueue | None = None,
) -> TaskDetailOut:
    task, project, membership = get_task_with_access(db, project_id, task_id, actor.id)
    require_task_write(membership)

    if task.version != data.version:
        raise ConflictError(
            "Task was modified by someone else; refresh and try again",
            code="stale_update",
        )

    fields = data.model_fields_set
    changes: list[str] = []
    old_assignee_id = task.assignee_id
    new_assignee: User | None = None

    if "title" in fields and data.title is not None:
        t = data.title.strip()
        if not t:
            raise BadRequestError("Task title cannot be blank")
        if t != task.title:
            task.title = t
            changes.append("title")
    if (
        "description" in fields
        and data.description is not None
        and data.description != task.description
    ):
        task.description = data.description
        changes.append("description")
    if "priority" in fields and data.priority is not None and data.priority != task.priority:
        task.priority = data.priority
        changes.append("priority")
    if "due_at" in fields and data.due_at != task.due_at:
        task.due_at = data.due_at
        changes.append("due_at")
    if "assignee_id" in fields:
        new_assignee = _validate_assignee_in_org(db, project.organization_id, data.assignee_id)
        if data.assignee_id != task.assignee_id:
            task.assignee_id = data.assignee_id
            changes.append("assignee_id")
    if "label_ids" in fields:
        task.labels = _validate_labels_in_org(db, project.organization_id, data.label_ids)
        changes.append("labels")

    task.version += 1
    task.updated_at = utcnow()
    project.updated_at = utcnow()

    task_key = f"{project.key}-{task.number}"
    if "assignee_id" in changes and task.assignee_id and task.assignee_id != old_assignee_id:
        assert new_assignee is not None
        assign_ev = record_activity(
            db,
            organization_id=project.organization_id,
            project_id=project.id,
            actor_id=actor.id,
            entity_type="task",
            entity_id=task.id,
            action="task.assigned",
            metadata={
                "task_key": task_key,
                "task_title": task.title,
                "assignee_id": str(new_assignee.id),
                "assignee_name": new_assignee.display_name,
            },
        )
        notify_users(
            db,
            event=assign_ev,
            actor=actor,
            recipient_ids={new_assignee.id},
            pref_field="on_assigned",
            rt_queue=rt_queue,
        )

    other_changes = [c for c in changes if c != "assignee_id"]
    if other_changes:
        record_activity(
            db,
            organization_id=project.organization_id,
            project_id=project.id,
            actor_id=actor.id,
            entity_type="task",
            entity_id=task.id,
            action="task.updated",
            metadata={"task_key": task_key, "task_title": task.title, "changes": other_changes},
        )

    db.commit()
    db.refresh(task)
    detail = _serialize_task_detail(db, task, project.key)
    card = TaskCardOut(**{k: getattr(detail, k) for k in TaskCardOut.model_fields})
    if rt_queue is not None:
        rt_queue.append(
            (
                project.organization_id,
                build_envelope(
                    "task.updated",
                    tenant_id=project.organization_id,
                    actor_id=actor.id,
                    entity_id=task.id,
                    project_id=project.id,
                    payload={"task": card.model_dump(mode="json")},
                ),
                None,
            )
        )
    return detail


def move_task(
    db: Session,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    actor: User,
    data: TaskMoveIn,
    rt_queue: RealtimeQueue | None = None,
) -> TaskCardOut:
    task_initial, project, membership = get_task_with_access(db, project_id, task_id, actor.id)
    require_task_write(membership)

    dest_col = get_column_in_project(db, project.id, data.column_id)
    src_col = get_column_in_project(db, project.id, task_initial.column_id)

    # Lock task row + destination column tasks to prevent concurrent ordering races
    task = db.scalar(select(Task).where(Task.id == task_initial.id).with_for_update())
    assert task is not None
    siblings = list(
        db.scalars(
            select(Task)
            .where(Task.column_id == dest_col.id, Task.id != task.id)
            .order_by(Task.position.asc(), Task.created_at.asc())
            .with_for_update()
        ).all()
    )

    idx = max(0, min(data.index, len(siblings)))
    needs_rebalance = False
    if not siblings:
        new_pos = POSITION_STEP
    elif idx == 0:
        new_pos = siblings[0].position - POSITION_STEP
    elif idx == len(siblings):
        new_pos = siblings[-1].position + POSITION_STEP
    else:
        left = siblings[idx - 1].position
        right = siblings[idx].position
        if (right - left) < REBALANCE_EPSILON:
            needs_rebalance = True
            new_pos = (left + right) / 2.0
        else:
            new_pos = (left + right) / 2.0

    from_col_id = task.column_id
    col_changed = from_col_id != dest_col.id
    task.column_id = dest_col.id
    task.position = new_pos
    task.version += 1
    now = utcnow()
    task.updated_at = now
    project.updated_at = now

    if dest_col.is_done and task.completed_at is None:
        task.completed_at = now
    elif not dest_col.is_done and task.completed_at is not None:
        task.completed_at = None

    if needs_rebalance:
        reordered = siblings[:idx] + [task] + siblings[idx:]
        for pos_idx, item in enumerate(reordered, start=1):
            item.position = pos_idx * POSITION_STEP

    if col_changed:
        task_key = f"{project.key}-{task.number}"
        ev = record_activity(
            db,
            organization_id=project.organization_id,
            project_id=project.id,
            actor_id=actor.id,
            entity_type="task",
            entity_id=task.id,
            action="task.moved",
            metadata={
                "task_key": task_key,
                "task_title": task.title,
                "from_column": src_col.name,
                "to_column": dest_col.name,
            },
        )
        recipients: set[uuid.UUID] = {task.created_by}
        if task.assignee_id:
            recipients.add(task.assignee_id)
        notify_users(
            db,
            event=ev,
            actor=actor,
            recipient_ids=recipients,
            pref_field="on_status_change",
            rt_queue=rt_queue,
        )

    db.commit()
    db.refresh(task)
    card = serialize_task_cards(db, [task], project.key)[0]
    if rt_queue is not None:
        rt_queue.append(
            (
                project.organization_id,
                build_envelope(
                    "task.moved",
                    tenant_id=project.organization_id,
                    actor_id=actor.id,
                    entity_id=task.id,
                    project_id=project.id,
                    payload={
                        "task": card.model_dump(mode="json"),
                        "from_column_id": str(from_col_id),
                    },
                ),
                None,
            )
        )
    return card


def delete_task(
    db: Session,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    actor: User,
    rt_queue: RealtimeQueue | None = None,
) -> None:
    task, project, membership = get_task_with_access(db, project_id, task_id, actor.id)
    require_task_write(membership)

    col_id = task.column_id
    task_key = f"{project.key}-{task.number}"
    task_title = task.title
    db.delete(task)
    record_activity(
        db,
        organization_id=project.organization_id,
        project_id=project.id,
        actor_id=actor.id,
        entity_type="task",
        entity_id=task_id,
        action="task.deleted",
        metadata={"task_key": task_key, "task_title": task_title},
    )
    db.commit()
    if rt_queue is not None:
        rt_queue.append(
            (
                project.organization_id,
                build_envelope(
                    "task.deleted",
                    tenant_id=project.organization_id,
                    actor_id=actor.id,
                    entity_id=task_id,
                    project_id=project.id,
                    payload={"task_id": str(task_id), "column_id": str(col_id)},
                ),
                None,
            )
        )


def create_subtask(
    db: Session, task_id: uuid.UUID, actor: User, data: SubtaskCreateIn
) -> SubtaskOut:
    task, _, membership = get_task_by_id_with_access(db, task_id, actor.id)
    require_task_write(membership)
    max_pos = db.scalar(select(func.max(Subtask.position)).where(Subtask.task_id == task.id))
    sub = Subtask(
        task_id=task.id,
        title=data.title.strip(),
        position=0 if max_pos is None else int(max_pos) + 1,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return SubtaskOut.model_validate(sub)


def update_subtask(
    db: Session,
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    actor: User,
    data: SubtaskUpdateIn,
) -> SubtaskOut:
    sub, _, _, membership = get_subtask_with_access(db, task_id, subtask_id, actor.id)
    require_task_write(membership)
    if data.title is not None:
        t = data.title.strip()
        if not t:
            raise BadRequestError("Subtask title cannot be blank")
        sub.title = t
    if data.is_done is not None:
        sub.is_done = data.is_done
    db.commit()
    db.refresh(sub)
    return SubtaskOut.model_validate(sub)


def delete_subtask(db: Session, task_id: uuid.UUID, subtask_id: uuid.UUID, actor: User) -> None:
    sub, _, _, membership = get_subtask_with_access(db, task_id, subtask_id, actor.id)
    require_task_write(membership)
    db.delete(sub)
    db.commit()


def _to_comment_out(c: Comment) -> CommentOut:
    return CommentOut(
        id=c.id,
        task_id=c.task_id,
        author=to_user_brief(c.author),
        body=c.body,
        created_at=c.created_at,
        updated_at=c.updated_at,
        edited=c.updated_at > c.created_at + timedelta(seconds=1),
    )


def list_comments(
    db: Session,
    task_id: uuid.UUID,
    user: User,
    cursor: str | None = None,
    limit: int = 20,
) -> CursorResponse[CommentOut]:
    task, _, _ = get_task_by_id_with_access(db, task_id, user.id)
    stmt = select(Comment).options(selectinload(Comment.author)).where(Comment.task_id == task.id)
    if cursor:
        ts, cid = decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                Comment.created_at > ts,
                (Comment.created_at == ts) & (Comment.id > cid),
            )
        )
    rows = list(
        db.scalars(stmt.order_by(Comment.created_at.asc(), Comment.id.asc()).limit(limit + 1)).all()
    )
    has_more = len(rows) > limit
    items = [_to_comment_out(c) for c in rows[:limit]]
    next_cursor = (
        encode_cursor(rows[limit - 1].created_at, rows[limit - 1].id) if has_more else None
    )
    return CursorResponse(items=items, next_cursor=next_cursor)


def create_comment(
    db: Session,
    task_id: uuid.UUID,
    actor: User,
    data: CommentCreateIn,
    rt_queue: RealtimeQueue | None = None,
) -> CommentOut:
    task, project, membership = get_task_by_id_with_access(db, task_id, actor.id)
    require_task_write(membership)
    body = data.body.strip()
    if not body:
        raise BadRequestError("Comment body cannot be blank")

    comment = Comment(task_id=task.id, author_id=actor.id, body=body)
    db.add(comment)
    db.flush()

    task_key = f"{project.key}-{task.number}"
    ev = record_activity(
        db,
        organization_id=project.organization_id,
        project_id=project.id,
        actor_id=actor.id,
        entity_type="comment",
        entity_id=comment.id,
        action="comment.created",
        metadata={
            "task_key": task_key,
            "task_title": task.title,
            "task_id": str(task.id),
            "excerpt": body[:120],
        },
    )
    recipients: set[uuid.UUID] = {task.created_by}
    if task.assignee_id:
        recipients.add(task.assignee_id)
    notify_users(
        db,
        event=ev,
        actor=actor,
        recipient_ids=recipients,
        pref_field="on_comment",
        rt_queue=rt_queue,
    )

    db.commit()
    db.refresh(comment)
    comment.author = actor
    out = _to_comment_out(comment)
    if rt_queue is not None:
        rt_queue.append(
            (
                project.organization_id,
                build_envelope(
                    "comment.created",
                    tenant_id=project.organization_id,
                    actor_id=actor.id,
                    entity_id=task.id,
                    project_id=project.id,
                    payload={"comment": out.model_dump(mode="json")},
                ),
                None,
            )
        )
    return out


def update_comment(
    db: Session,
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    actor: User,
    data: CommentUpdateIn,
) -> CommentOut:
    comment, _, _, _ = get_comment_with_access(db, task_id, comment_id, actor.id)
    if comment.author_id != actor.id:
        raise ForbiddenError("Only the comment author can edit this comment")
    body = data.body.strip()
    if not body:
        raise BadRequestError("Comment body cannot be blank")
    comment.body = body
    comment.updated_at = utcnow()
    db.commit()
    db.refresh(comment)
    comment.author = actor
    return _to_comment_out(comment)


def delete_comment(db: Session, task_id: uuid.UUID, comment_id: uuid.UUID, actor: User) -> None:
    comment, _, _, membership = get_comment_with_access(db, task_id, comment_id, actor.id)
    if comment.author_id != actor.id:
        require_org_role(membership, "admin")
    db.delete(comment)
    db.commit()


def list_saved_views(db: Session, project_id: uuid.UUID, user: User) -> list[SavedViewOut]:
    project, _, _ = get_project_with_membership(db, project_id, user.id)
    rows = db.scalars(
        select(SavedView)
        .where(SavedView.project_id == project.id, SavedView.user_id == user.id)
        .order_by(SavedView.created_at.asc())
    ).all()
    return [
        SavedViewOut(
            id=v.id,
            project_id=v.project_id,
            name=v.name,
            filters=v.filters or {},
            created_at=v.created_at,
        )
        for v in rows
    ]


def create_saved_view(
    db: Session, project_id: uuid.UUID, user: User, data: SavedViewCreateIn
) -> SavedViewOut:
    project, _, _ = get_project_with_membership(db, project_id, user.id)
    view = SavedView(
        project_id=project.id,
        user_id=user.id,
        name=data.name.strip(),
        filters=data.filters,
    )
    db.add(view)
    db.commit()
    db.refresh(view)
    return SavedViewOut(
        id=view.id,
        project_id=view.project_id,
        name=view.name,
        filters=view.filters or {},
        created_at=view.created_at,
    )


def delete_saved_view(db: Session, project_id: uuid.UUID, view_id: uuid.UUID, user: User) -> None:
    project, _, _ = get_project_with_membership(db, project_id, user.id)
    view = db.scalar(
        select(SavedView).where(
            SavedView.id == view_id,
            SavedView.project_id == project.id,
            SavedView.user_id == user.id,
        )
    )
    if not view:
        raise NotFoundError("Saved view not found")
    db.delete(view)
    db.commit()
