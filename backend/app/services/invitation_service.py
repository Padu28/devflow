from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal, cast

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.security import generate_opaque_token, hash_token
from app.db.base import utcnow
from app.models.organization import Invitation, Membership, Organization
from app.models.user import User
from app.repositories.tenancy import get_org_membership, require_org_role
from app.schemas.common import OrgRole
from app.schemas.organization import (
    InvitationCreateIn,
    InvitationOut,
    MyInvitationOut,
    OrganizationBrief,
    OrganizationSummaryOut,
)
from app.services.activity_service import (
    RealtimeQueue,
    notify_users,
    record_activity,
    to_user_brief,
)
from app.services.org_service import _org_summary


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _to_invitation_out(inv: Invitation, invite_url: str | None = None) -> InvitationOut:
    return InvitationOut(
        id=inv.id,
        organization_id=inv.organization_id,
        email=inv.email,
        role=cast(OrgRole, inv.role),
        status=cast(Literal["pending", "accepted", "revoked", "expired"], inv.status),
        invited_by=to_user_brief(inv.inviter),
        expires_at=inv.expires_at,
        created_at=inv.created_at,
        invite_url=invite_url,
    )


def list_org_invitations(db: Session, org_id: uuid.UUID, user: User) -> list[InvitationOut]:
    _, membership = get_org_membership(db, org_id, user.id)
    require_org_role(membership, "admin")
    rows = db.scalars(
        select(Invitation)
        .options(selectinload(Invitation.inviter))
        .where(Invitation.organization_id == org_id, Invitation.status == "pending")
        .order_by(Invitation.created_at.desc())
    ).all()
    return [_to_invitation_out(inv) for inv in rows]


def create_invitation(
    db: Session,
    org_id: uuid.UUID,
    actor: User,
    data: InvitationCreateIn,
    rt_queue: RealtimeQueue | None = None,
) -> InvitationOut:
    org, membership = get_org_membership(db, org_id, actor.id)
    require_org_role(membership, "admin")
    email = data.email.strip().lower()

    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user:
        already_member = db.scalar(
            select(Membership.id).where(
                Membership.organization_id == org_id,
                Membership.user_id == existing_user.id,
            )
        )
        if already_member:
            raise ConflictError("User is already a member of this workspace")

    pending = db.scalar(
        select(Invitation.id).where(
            Invitation.organization_id == org_id,
            Invitation.email == email,
            Invitation.status == "pending",
        )
    )
    if pending:
        raise ConflictError("A pending invitation already exists for this email")

    raw_token = generate_opaque_token(32)
    inv = Invitation(
        organization_id=org_id,
        email=email,
        role=data.role,
        token_hash=hash_token(raw_token),
        status="pending",
        invited_by=actor.id,
        expires_at=utcnow() + timedelta(days=7),
    )
    db.add(inv)
    db.flush()

    ev = record_activity(
        db,
        organization_id=org_id,
        project_id=None,
        actor_id=actor.id,
        entity_type="invitation",
        entity_id=inv.id,
        action="invitation.sent",
        metadata={"email": email, "role": data.role, "org_name": org.name},
    )
    if existing_user:
        notify_users(
            db,
            event=ev,
            actor=actor,
            recipient_ids={existing_user.id},
            pref_field="on_invitation",
            rt_queue=rt_queue,
        )

    db.commit()
    db.refresh(inv)
    inv.inviter = actor
    settings = get_settings()
    invite_url = f"{settings.frontend_url}/invite/{raw_token}"
    return _to_invitation_out(inv, invite_url=invite_url)


def revoke_invitation(
    db: Session, org_id: uuid.UUID, invitation_id: uuid.UUID, actor: User
) -> None:
    _, membership = get_org_membership(db, org_id, actor.id)
    require_org_role(membership, "admin")
    inv = db.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id, Invitation.organization_id == org_id
        )
    )
    if not inv:
        raise NotFoundError("Invitation not found")
    if inv.status != "pending":
        raise BadRequestError("Only pending invitations can be revoked")
    inv.status = "revoked"
    db.commit()


def list_my_invitations(db: Session, user: User) -> list[MyInvitationOut]:
    now = utcnow()
    rows = db.scalars(
        select(Invitation)
        .options(selectinload(Invitation.organization), selectinload(Invitation.inviter))
        .where(
            Invitation.email == user.email.lower(),
            Invitation.status == "pending",
        )
        .order_by(Invitation.created_at.desc())
    ).all()
    return [
        MyInvitationOut(
            id=inv.id,
            organization=OrganizationBrief(
                id=inv.organization.id,
                name=inv.organization.name,
                slug=inv.organization.slug,
            ),
            role=cast(OrgRole, inv.role),
            invited_by=to_user_brief(inv.inviter),
            expires_at=inv.expires_at,
        )
        for inv in rows
        if _as_utc(inv.expires_at) > now
    ]


def _accept_invitation(db: Session, inv: Invitation, user: User) -> OrganizationSummaryOut:
    now = utcnow()
    if inv.status != "pending":
        raise BadRequestError("Invitation is no longer valid")
    if _as_utc(inv.expires_at) <= now:
        inv.status = "expired"
        db.commit()
        raise BadRequestError("Invitation has expired")
    if inv.email.lower() != user.email.lower():
        raise ForbiddenError("This invitation was sent to a different email address")

    existing = db.scalar(
        select(Membership).where(
            Membership.organization_id == inv.organization_id,
            Membership.user_id == user.id,
        )
    )
    if not existing:
        db.add(Membership(organization_id=inv.organization_id, user_id=user.id, role=inv.role))
        record_activity(
            db,
            organization_id=inv.organization_id,
            project_id=None,
            actor_id=user.id,
            entity_type="member",
            entity_id=user.id,
            action="member.joined",
            metadata={"member_name": user.display_name, "role": inv.role},
        )
    inv.status = "accepted"
    db.commit()

    org = db.get(Organization, inv.organization_id)
    assert org is not None
    return _org_summary(db, org, existing.role if existing else inv.role)


def accept_invitation_by_id(
    db: Session, invitation_id: uuid.UUID, user: User
) -> OrganizationSummaryOut:
    inv = db.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id, Invitation.email == user.email.lower()
        )
    )
    if not inv:
        raise NotFoundError("Invitation not found")
    return _accept_invitation(db, inv, user)


def decline_invitation_by_id(db: Session, invitation_id: uuid.UUID, user: User) -> None:
    inv = db.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id, Invitation.email == user.email.lower()
        )
    )
    if not inv:
        raise NotFoundError("Invitation not found")
    if inv.status == "pending":
        inv.status = "revoked"
        db.commit()


def accept_invitation_by_token(db: Session, raw_token: str, user: User) -> OrganizationSummaryOut:
    inv = db.scalar(select(Invitation).where(Invitation.token_hash == hash_token(raw_token)))
    if not inv:
        raise BadRequestError("Invalid or expired invitation token")
    return _accept_invitation(db, inv, user)
