from __future__ import annotations

import re
import uuid
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.organization import Membership, Organization
from app.models.project import Label, Project
from app.models.user import User
from app.repositories.tenancy import get_org_membership, require_org_role
from app.schemas.common import LabelOut, OrgRole
from app.schemas.organization import (
    LabelCreateIn,
    LabelUpdateIn,
    MemberOut,
    OrganizationCreateIn,
    OrganizationSummaryOut,
    OrganizationUpdateIn,
)
from app.services.activity_service import record_activity, to_user_brief

DEFAULT_LABELS = [
    ("Bug", "#F43F5E"),
    ("Feature", "#C6F432"),
    ("Design", "#A78BFA"),
    ("Docs", "#38BDF8"),
]


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return base[:60] or "workspace"


def _unique_slug(db: Session, base: str) -> str:
    candidate = base
    suffix = 1
    while db.scalar(select(Organization.id).where(Organization.slug == candidate)) is not None:
        suffix += 1
        candidate = f"{base[:52]}-{suffix}"
    return candidate


def _org_summary(db: Session, org: Organization, role: str) -> OrganizationSummaryOut:
    member_count = (
        db.scalar(select(func.count(Membership.id)).where(Membership.organization_id == org.id))
        or 0
    )
    project_count = (
        db.scalar(
            select(func.count(Project.id)).where(
                Project.organization_id == org.id, Project.archived_at.is_(None)
            )
        )
        or 0
    )
    return OrganizationSummaryOut(
        id=org.id,
        name=org.name,
        slug=org.slug,
        role=cast(OrgRole, role),
        member_count=member_count,
        project_count=project_count,
        created_at=org.created_at,
    )


def list_user_organizations(db: Session, user: User) -> list[OrganizationSummaryOut]:
    rows = db.execute(
        select(Organization, Membership.role)
        .join(Membership, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user.id)
        .order_by(Organization.created_at.asc())
    ).all()
    if not rows:
        return []
    org_ids = [r[0].id for r in rows]
    member_counts: dict[uuid.UUID, int] = {
        r[0]: int(r[1])
        for r in db.execute(
            select(Membership.organization_id, func.count(Membership.id))
            .where(Membership.organization_id.in_(org_ids))
            .group_by(Membership.organization_id)
        ).all()
    }
    project_counts: dict[uuid.UUID, int] = {
        r[0]: int(r[1])
        for r in db.execute(
            select(Project.organization_id, func.count(Project.id))
            .where(Project.organization_id.in_(org_ids), Project.archived_at.is_(None))
            .group_by(Project.organization_id)
        ).all()
    }
    return [
        OrganizationSummaryOut(
            id=org.id,
            name=org.name,
            slug=org.slug,
            role=cast(OrgRole, role),
            member_count=int(member_counts.get(org.id, 0)),
            project_count=int(project_counts.get(org.id, 0)),
            created_at=org.created_at,
        )
        for org, role in rows
    ]


def create_organization(
    db: Session, user: User, data: OrganizationCreateIn
) -> OrganizationSummaryOut:
    name = data.name.strip()
    if not name:
        raise BadRequestError("Workspace name cannot be blank")
    if data.slug:
        existing = db.scalar(select(Organization.id).where(Organization.slug == data.slug))
        if existing:
            raise ConflictError("Workspace slug is already taken")
        slug = data.slug
    else:
        slug = _unique_slug(db, _slugify(name))

    org = Organization(name=name, slug=slug, created_by=user.id)
    db.add(org)
    db.flush()

    db.add(Membership(organization_id=org.id, user_id=user.id, role="owner"))
    for label_name, color in DEFAULT_LABELS:
        db.add(Label(organization_id=org.id, name=label_name, color=color))

    record_activity(
        db,
        organization_id=org.id,
        project_id=None,
        actor_id=user.id,
        entity_type="organization",
        entity_id=org.id,
        action="organization.created",
        metadata={"name": org.name},
    )
    db.commit()
    db.refresh(org)
    return _org_summary(db, org, "owner")


def get_organization_summary(db: Session, org_id: uuid.UUID, user: User) -> OrganizationSummaryOut:
    org, membership = get_org_membership(db, org_id, user.id)
    return _org_summary(db, org, membership.role)


def update_organization(
    db: Session, org_id: uuid.UUID, user: User, data: OrganizationUpdateIn
) -> OrganizationSummaryOut:
    org, membership = get_org_membership(db, org_id, user.id)
    require_org_role(membership, "admin")
    name = data.name.strip()
    if not name:
        raise BadRequestError("Workspace name cannot be blank")
    org.name = name
    db.commit()
    db.refresh(org)
    return _org_summary(db, org, membership.role)


def delete_organization(db: Session, org_id: uuid.UUID, user: User) -> None:
    org, membership = get_org_membership(db, org_id, user.id)
    require_org_role(membership, "owner")
    db.delete(org)
    db.commit()


def list_members(db: Session, org_id: uuid.UUID, user: User) -> list[MemberOut]:
    get_org_membership(db, org_id, user.id)
    rows = db.scalars(
        select(Membership)
        .options(selectinload(Membership.user))
        .where(Membership.organization_id == org_id)
        .order_by(Membership.joined_at.asc())
    ).all()
    return [
        MemberOut(
            user=to_user_brief(m.user),
            role=cast(OrgRole, m.role),
            joined_at=m.joined_at,
        )
        for m in rows
    ]


def update_member_role(
    db: Session,
    org_id: uuid.UUID,
    target_user_id: uuid.UUID,
    new_role: OrgRole,
    actor: User,
) -> MemberOut:
    _, actor_membership = get_org_membership(db, org_id, actor.id)
    require_org_role(actor_membership, "admin")

    target = db.scalar(
        select(Membership)
        .options(selectinload(Membership.user))
        .where(Membership.organization_id == org_id, Membership.user_id == target_user_id)
    )
    if not target:
        raise NotFoundError("Member not found")

    if (
        new_role in ("owner", "admin") or target.role in ("owner", "admin")
    ) and actor_membership.role != "owner":
        raise ForbiddenError("Only an owner can grant or revoke owner/admin roles")

    if target.role == "owner" and new_role != "owner":
        owner_count = (
            db.scalar(
                select(func.count(Membership.id)).where(
                    Membership.organization_id == org_id, Membership.role == "owner"
                )
            )
            or 0
        )
        if owner_count <= 1:
            raise BadRequestError("Cannot demote the last organization owner")

    old_role = target.role
    target.role = new_role
    record_activity(
        db,
        organization_id=org_id,
        project_id=None,
        actor_id=actor.id,
        entity_type="member",
        entity_id=target.user_id,
        action="member.role_changed",
        metadata={
            "member_name": target.user.display_name,
            "from_role": old_role,
            "to_role": new_role,
        },
    )
    db.commit()
    db.refresh(target)
    return MemberOut(
        user=to_user_brief(target.user),
        role=new_role,
        joined_at=target.joined_at,
    )


def remove_member(db: Session, org_id: uuid.UUID, target_user_id: uuid.UUID, actor: User) -> None:
    _, actor_membership = get_org_membership(db, org_id, actor.id)
    is_self = target_user_id == actor.id
    if not is_self:
        require_org_role(actor_membership, "admin")

    target = db.scalar(
        select(Membership)
        .options(selectinload(Membership.user))
        .where(Membership.organization_id == org_id, Membership.user_id == target_user_id)
    )
    if not target:
        raise NotFoundError("Member not found")

    if target.role == "owner":
        if not is_self and actor_membership.role != "owner":
            raise ForbiddenError("Only an owner can remove another owner")
        owner_count = (
            db.scalar(
                select(func.count(Membership.id)).where(
                    Membership.organization_id == org_id, Membership.role == "owner"
                )
            )
            or 0
        )
        if owner_count <= 1:
            raise BadRequestError("Cannot remove the last organization owner")

    member_name = target.user.display_name
    db.delete(target)
    record_activity(
        db,
        organization_id=org_id,
        project_id=None,
        actor_id=actor.id,
        entity_type="member",
        entity_id=target_user_id,
        action="member.removed",
        metadata={"member_name": member_name},
    )
    db.commit()


def list_labels(db: Session, org_id: uuid.UUID, user: User) -> list[LabelOut]:
    get_org_membership(db, org_id, user.id)
    labels = db.scalars(
        select(Label).where(Label.organization_id == org_id).order_by(Label.name.asc())
    ).all()
    return [LabelOut.model_validate(lb) for lb in labels]


def create_label(db: Session, org_id: uuid.UUID, user: User, data: LabelCreateIn) -> LabelOut:
    _, membership = get_org_membership(db, org_id, user.id)
    require_org_role(membership, "member")
    name = data.name.strip()
    if not name:
        raise BadRequestError("Label name cannot be blank")
    existing = db.scalar(
        select(Label.id).where(
            Label.organization_id == org_id, func.lower(Label.name) == name.lower()
        )
    )
    if existing:
        raise ConflictError("A label with this name already exists")
    lb = Label(organization_id=org_id, name=name, color=data.color)
    db.add(lb)
    db.commit()
    db.refresh(lb)
    return LabelOut.model_validate(lb)


def update_label(
    db: Session, org_id: uuid.UUID, label_id: uuid.UUID, user: User, data: LabelUpdateIn
) -> LabelOut:
    _, membership = get_org_membership(db, org_id, user.id)
    require_org_role(membership, "member")
    lb = db.scalar(select(Label).where(Label.id == label_id, Label.organization_id == org_id))
    if not lb:
        raise NotFoundError("Label not found")
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise BadRequestError("Label name cannot be blank")
        dup = db.scalar(
            select(Label.id).where(
                Label.organization_id == org_id,
                func.lower(Label.name) == name.lower(),
                Label.id != label_id,
            )
        )
        if dup:
            raise ConflictError("A label with this name already exists")
        lb.name = name
    if data.color is not None:
        lb.color = data.color
    db.commit()
    db.refresh(lb)
    return LabelOut.model_validate(lb)


def delete_label(db: Session, org_id: uuid.UUID, label_id: uuid.UUID, user: User) -> None:
    _, membership = get_org_membership(db, org_id, user.id)
    require_org_role(membership, "member")
    lb = db.scalar(select(Label).where(Label.id == label_id, Label.organization_id == org_id))
    if not lb:
        raise NotFoundError("Label not found")
    db.delete(lb)
    db.commit()
