from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import request_id_var


class AppError(Exception):
    """Base domain/API exception mapped to the contract error envelope."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers


class BadRequestError(AppError):
    def __init__(self, message: str = "Bad request", details: Any = None) -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, "bad_request", message, details)


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Authentication required") -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, "unauthorized", message)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Insufficient permissions") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, "forbidden", message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, "not_found", message)


class ConflictError(AppError):
    def __init__(self, message: str = "Resource conflict", code: str = "conflict") -> None:
        super().__init__(status.HTTP_409_CONFLICT, code, message)


class RateLimitError(AppError):
    def __init__(self, retry_after: int = 60) -> None:
        super().__init__(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "rate_limited",
            "Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    req_id = request_id_var.get()
    body = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
        },
        "request_id": req_id,
    }
    resp_headers = {"X-Request-ID": req_id}
    if headers:
        resp_headers.update(headers)
    return JSONResponse(status_code=status_code, content=body, headers=resp_headers)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.details, exc.headers)


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        {
            "loc": [str(part) for part in err.get("loc", [])],
            "msg": err.get("msg", "Invalid value"),
            "type": err.get("type", "value_error"),
        }
        for err in exc.errors()
    ]
    return error_response(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        "validation_error",
        "Request validation failed",
        details=details,
    )


async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    code_map = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        429: "rate_limited",
    }
    return error_response(
        exc.status_code,
        code_map.get(exc.status_code, "http_error"),
        str(exc.detail),
    )


async def unhandled_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "internal_error",
        "An unexpected error occurred",
    )
