from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app import db


def test_manifest_path_creates_directory(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    path = db.manifest_path("job99")
    assert path.parent == Path("data/manifests")
    assert path.parent.exists()
    assert path.name == "job99.json"


@pytest.mark.asyncio
async def test_get_session_yields_async_session(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir()
    monkeypatch.setenv("DB_MODE", "sqlite")
    monkeypatch.setenv("DB_URL", "sqlite+aiosqlite:///./data/test.db")

    async with db.get_session() as session:
        assert isinstance(session, AsyncSession)


@pytest.mark.asyncio
async def test_get_session_errors_when_not_sqlite(monkeypatch) -> None:
    monkeypatch.setattr(db, "get_settings", lambda: SimpleNamespace(db_mode="manifests"))

    with pytest.raises(RuntimeError):
        async with db.get_session():  # pragma: no cover - exercising exception path
            pass
