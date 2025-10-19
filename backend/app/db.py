"""Database and manifest helpers."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings
from .models import Base

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_schema_initialized: bool = False


def _ensure_engine() -> None:
    """Lazy-create the SQLAlchemy engine when running in sqlite mode."""
    global _engine, _session_factory  # noqa: PLW0603 (module-level cache)

    settings = get_settings()
    if settings.db_mode != "sqlite":
        return

    if _engine is None:
        _engine = create_async_engine(settings.db_url, future=True)
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def ensure_schema() -> None:
    """Create database tables once when running in sqlite mode."""
    global _schema_initialized  # noqa: PLW0603

    settings = get_settings()
    if settings.db_mode != "sqlite" or _schema_initialized:
        return

    _ensure_engine()
    assert _engine is not None  # nosec: guarded by _ensure_engine

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    _schema_initialized = True


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield an async SQLAlchemy session when the service is configured for SQLite."""
    settings = get_settings()
    if settings.db_mode != "sqlite":
        raise RuntimeError("Database sessions are only available in sqlite mode")

    _ensure_engine()
    assert _session_factory is not None  # nosec - guarded by _ensure_engine

    session = _session_factory()
    try:
        yield session
    finally:
        await session.close()


def manifest_path(job_id: str) -> Path:
    """Return the JSON manifest path for a given job id."""
    base = Path("data/manifests")
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{job_id}.json"


__all__ = ("ensure_schema", "get_session", "manifest_path")
