from __future__ import annotations

import logging
import time
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    auth,
    health,
    invitations,
    notifications,
    organizations,
    projects,
    tasks,
    users,
    ws,
)
from app.core.config import get_settings
from app.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_error_handler,
)
from app.core.logging import configure_logging, request_id_var, user_id_var
from app.realtime.manager import manager

access_logger = logging.getLogger("devflow.access")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    if settings.redis_url:
        await manager.start_redis_bridge(settings.redis_url)
    yield
    await manager.stop_redis_bridge()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="DevFlow API",
        description="Multi-tenant project management and real-time collaboration platform.",
        version=settings.app_version,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        tok_req = request_id_var.set(req_id)
        tok_usr = user_id_var.set(None)
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            access_logger.info(
                "request",
                extra={
                    "extra_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "status": status_code,
                        "duration_ms": duration_ms,
                    }
                },
            )
            request_id_var.reset(tok_req)
            user_id_var.reset(tok_usr)

        response.headers["X-Request-ID"] = req_id
        return response

    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # Root health endpoints
    app.include_router(health.router)

    # Versioned API v1
    v1_prefix = "/api/v1"
    app.include_router(health.router, prefix=v1_prefix)
    app.include_router(auth.router, prefix=v1_prefix)
    app.include_router(users.router, prefix=v1_prefix)
    app.include_router(organizations.router, prefix=v1_prefix)
    app.include_router(invitations.router, prefix=v1_prefix)
    app.include_router(projects.router, prefix=v1_prefix)
    app.include_router(tasks.router, prefix=v1_prefix)
    app.include_router(notifications.router, prefix=v1_prefix)
    app.include_router(ws.router, prefix=v1_prefix)

    return app


app = create_app()
