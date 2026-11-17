from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.realtime.events import dispatch_after_commit
from app.schemas.organization import (
    AcceptTokenIn,
    InvitationCreateIn,
    InvitationOut,
    MyInvitationOut,
    OrganizationSummaryOut,
)
from app.services import invitation_service
from app.services.activity_service import RealtimeQueue

router = APIRouter(tags=["invitations"])


@router.get(
    "/organizations/{org_id}/invitations",
    response_model=list[InvitationOut],
    summary="List pending invitations for organization",
)
def list_org_invitations(
    org_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[InvitationOut]:
    return invitation_service.list_org_invitations(db, org_id, user)


@router.post(
    "/organizations/{org_id}/invitations",
    response_model=InvitationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a user by email",
)
def create_invitation(
    org_id: uuid.UUID,
    body: InvitationCreateIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> InvitationOut:
    rt_queue: RealtimeQueue = []
    res = invitation_service.create_invitation(db, org_id, user, body, rt_queue=rt_queue)
    dispatch_after_commit(rt_queue)
    return res


@router.delete(
    "/organizations/{org_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a pending invitation",
)
def revoke_invitation(
    org_id: uuid.UUID,
    invitation_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    invitation_service.revoke_invitation(db, org_id, invitation_id, user)


@router.get(
    "/invitations",
    response_model=list[MyInvitationOut],
    summary="List pending invitations addressed to me",
)
def my_invitations(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[MyInvitationOut]:
    return invitation_service.list_my_invitations(db, user)


@router.post(
    "/invitations/{invitation_id}/accept",
    response_model=OrganizationSummaryOut,
    summary="Accept an invitation by ID",
)
def accept_by_id(
    invitation_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> OrganizationSummaryOut:
    return invitation_service.accept_invitation_by_id(db, invitation_id, user)


@router.post(
    "/invitations/{invitation_id}/decline",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Decline an invitation by ID",
)
def decline_by_id(
    invitation_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    invitation_service.decline_invitation_by_id(db, invitation_id, user)


@router.post(
    "/invitations/accept-token",
    response_model=OrganizationSummaryOut,
    summary="Accept an invitation using its secret token",
)
def accept_by_token(
    body: AcceptTokenIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> OrganizationSummaryOut:
    return invitation_service.accept_invitation_by_token(db, body.token, user)
