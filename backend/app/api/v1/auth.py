from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.rate_limit import limit_auth_requests
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginIn,
    PasswordResetConfirmIn,
    PasswordResetRequestIn,
    PasswordResetRequestOut,
    RegisterIn,
)
from app.schemas.common import UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "devflow_refresh"


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
        max_age=settings.refresh_token_ttl_days * 86400,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
        path="/api/v1/auth",
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limit_auth_requests)],
    summary="Register a new user account",
)
def register(
    body: RegisterIn,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    auth_res, raw_refresh = auth_service.register_user(db, body)
    _set_refresh_cookie(response, raw_refresh)
    return auth_res


@router.post(
    "/login",
    response_model=AuthResponse,
    dependencies=[Depends(limit_auth_requests)],
    summary="Authenticate with email and password",
)
def login(
    body: LoginIn,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    auth_res, raw_refresh = auth_service.login_user(db, body)
    _set_refresh_cookie(response, raw_refresh)
    return auth_res


@router.post(
    "/refresh",
    response_model=AuthResponse,
    summary="Rotate refresh cookie and issue new access token",
)
def refresh(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    devflow_refresh: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> AuthResponse:
    auth_res, raw_refresh = auth_service.refresh_session(db, devflow_refresh)
    _set_refresh_cookie(response, raw_refresh)
    return auth_res


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke current refresh token family and clear cookie",
)
def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    devflow_refresh: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> None:
    auth_service.logout_session(db, devflow_refresh)
    _clear_refresh_cookie(response)


@router.post(
    "/password-reset/request",
    response_model=PasswordResetRequestOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(limit_auth_requests)],
    summary="Request a password reset token",
)
def password_reset_request(
    body: PasswordResetRequestIn,
    db: Annotated[Session, Depends(get_db)],
) -> PasswordResetRequestOut:
    return auth_service.request_password_reset(db, body.email)


@router.post(
    "/password-reset/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Confirm password reset using a token",
)
def password_reset_confirm(
    body: PasswordResetConfirmIn,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    auth_service.confirm_password_reset(db, body)


@router.get("/me", response_model=UserOut, summary="Get current authenticated user")
def me(current_user: Annotated[User, Depends(get_current_user)]) -> UserOut:
    return UserOut.model_validate(current_user)
