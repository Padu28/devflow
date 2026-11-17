from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import SessionLocal

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "version": settings.app_version}


@router.get("/ready", summary="Readiness probe")
def ready() -> JSONResponse:
    settings = get_settings()
    db_status = "ok"
    ok = True
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
        ok = False

    redis_status = "disabled"
    if settings.redis_url:
        try:
            import redis

            client = redis.from_url(settings.redis_url, socket_connect_timeout=1)
            client.ping()
            redis_status = "ok"
        except Exception:
            redis_status = "error"
            ok = False

    code = status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(
        status_code=code,
        content={
            "status": "ready" if ok else "degraded",
            "database": db_status,
            "redis": redis_status,
        },
    )
