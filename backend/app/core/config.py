from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DEV_SECRET = "devflow-local-dev-secret-key-change-in-production-32chars"


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["development", "test", "production"] = "development"
    app_version: str = "1.0.0"
    log_level: str = "INFO"

    database_url: str = "sqlite:///./devflow.db"
    test_database_url: str = ""

    secret_key: str = DEFAULT_DEV_SECRET
    access_token_ttl_minutes: int = Field(default=15, ge=1, le=1440)
    refresh_token_ttl_days: int = Field(default=14, ge=1, le=90)
    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=120)

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080"
    frontend_url: str = "http://localhost:5173"

    redis_url: str = ""
    rate_limit_enabled: bool = True

    @model_validator(mode="after")
    def _validate_production_secret(self) -> Settings:
        if self.environment == "production" and (
            self.secret_key == DEFAULT_DEV_SECRET or len(self.secret_key) < 32
        ):
            raise ValueError(
                "SECRET_KEY must be set to a strong (>=32 char) non-default value in production."
            )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
