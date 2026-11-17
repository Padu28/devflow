from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import UnauthorizedError
from app.core.logging import user_id_var
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if not creds or creds.scheme.lower() != "bearer":
        raise UnauthorizedError("Missing or invalid authorization header")
    user_id = decode_access_token(creds.credentials)
    if not user_id:
        raise UnauthorizedError("Invalid or expired access token")
    user = db.get(User, user_id)
    if not user:
        raise UnauthorizedError("User no longer exists")
    user_id_var.set(str(user.id))
    return user


def get_db_session(db: Annotated[Session, Depends(get_db)]) -> Generator[Session, None, None]:
    yield db
