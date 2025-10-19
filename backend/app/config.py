"""Application configuration powered by Pydantic settings."""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _lenient_json_loads(value: str) -> object:
    """Attempt to decode JSON, falling back to the raw string on error."""
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


class Settings(BaseSettings):
    """Runtime configuration sourced from environment variables and .env files."""

    translator_provider: Literal["openai", "hf"] = Field(
        default="openai", alias="TRANSLATOR_PROVIDER"
    )
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")

    storage_backend: Literal["local", "s3"] = Field(
        default="local", alias="STORAGE_BACKEND"
    )
    s3_endpoint: AnyHttpUrl | None = Field(default=None, alias="S3_ENDPOINT")
    s3_access_key: str | None = Field(default=None, alias="S3_ACCESS_KEY")
    s3_secret_key: str | None = Field(default=None, alias="S3_SECRET_KEY")
    s3_bucket: str = Field(default="book-translator", alias="S3_BUCKET")

    db_mode: Literal["sqlite", "manifests"] = Field(default="sqlite", alias="DB_MODE")
    db_url: str = Field(default="sqlite+aiosqlite:///./data/app.db", alias="DB_URL")

    max_pdf_mb: int = Field(default=100, alias="MAX_PDF_MB")
    max_pages: int = Field(default=600, alias="MAX_PAGES")
    target_langs: list[str] = Field(default_factory=lambda: ["es", "fr", "de", "it", "pt"], alias="TARGET_LANGS")

    cors_allow_origins: list[str] = Field(default_factory=lambda: ["*"], alias="CORS_ALLOW_ORIGINS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_json_loads=_lenient_json_loads,
    )

    @field_validator("target_langs", mode="before")
    @classmethod
    def parse_target_langs(cls, value: str | list[str]) -> list[str]:
        """Allow comma-separated strings for `TARGET_LANGS`."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("cors_allow_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        """Support comma-separated origins in the environment."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached `Settings` instance."""
    return Settings()


__all__ = ("Settings", "get_settings")
