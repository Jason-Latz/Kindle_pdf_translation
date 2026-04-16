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


def test_ensure_engine_skips_when_not_relational(monkeypatch) -> None:
    monkeypatch.setattr(db, "get_settings", lambda: SimpleNamespace(db_mode="manifests"))
    monkeypatch.setattr(db, "create_async_engine", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError))
    monkeypatch.setattr(db, "_engine", None, raising=False)
    monkeypatch.setattr(db, "_session_factory", None, raising=False)

    db._ensure_engine()

    assert db._engine is None
    assert db._session_factory is None


@pytest.mark.parametrize(
    ("db_mode", "db_url"),
    [
        ("sqlite", "sqlite+aiosqlite:///./data/test.db"),
        ("postgres", "postgresql+asyncpg://postgres:password@example.com:5432/postgres"),
    ],
)
@pytest.mark.asyncio
async def test_ensure_schema_initializes_engine(monkeypatch, db_mode: str, db_url: str) -> None:
    class _DummyBegin:
        def __init__(self) -> None:
            self.ran_sync = False

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def run_sync(self, _fn) -> None:
            self.ran_sync = True

    class _DummyEngine:
        def __init__(self) -> None:
            self.begin_ctx = _DummyBegin()

        def begin(self):
            return self.begin_ctx

    class _DummyFactory:
        def __call__(self):
            return _DummySession()

    class _DummySession:
        async def close(self) -> None:
            return None

    dummy_engine = _DummyEngine()

    monkeypatch.setattr(
        db,
        "get_settings",
        lambda: SimpleNamespace(db_mode=db_mode, db_url=db_url),
    )
    monkeypatch.setattr(db, "create_async_engine", lambda *args, **kwargs: dummy_engine)
    monkeypatch.setattr(db, "async_sessionmaker", lambda *args, **kwargs: _DummyFactory())
    monkeypatch.setattr(db, "_engine", None, raising=False)
    monkeypatch.setattr(db, "_session_factory", None, raising=False)
    monkeypatch.setattr(db, "_schema_initialized", False, raising=False)

    await db.ensure_schema()

    assert db._engine is dummy_engine
    assert db._session_factory is not None
    assert db._schema_initialized is True
    assert dummy_engine.begin_ctx.ran_sync is True


@pytest.mark.asyncio
async def test_get_session_yields_async_session(tmp_path, monkeypatch) -> None:
    pytest.importorskip("greenlet")
    monkeypatch.chdir(tmp_path)
    (tmp_path / "data").mkdir()
    monkeypatch.setenv("DB_MODE", "sqlite")
    monkeypatch.setenv("DB_URL", "sqlite+aiosqlite:///./data/test.db")

    async with db.get_session() as session:
        assert isinstance(session, AsyncSession)


@pytest.mark.asyncio
async def test_get_session_errors_when_not_relational(monkeypatch) -> None:
    monkeypatch.setattr(db, "get_settings", lambda: SimpleNamespace(db_mode="manifests"))

    with pytest.raises(RuntimeError):
        async with db.get_session():  # pragma: no cover - exercising exception path
            pass


@pytest.mark.parametrize(
    ("db_mode", "db_url"),
    [
        ("sqlite", "sqlite+aiosqlite:///./data/test.db"),
        ("postgres", "postgresql+asyncpg://postgres:password@example.com:5432/postgres"),
    ],
)
@pytest.mark.asyncio
async def test_get_session_uses_stub_factory(
    monkeypatch, db_mode: str, db_url: str
) -> None:
    class _DummySession:
        def __init__(self) -> None:
            self.closed = False

        async def close(self) -> None:
            self.closed = True

    class _DummyFactory:
        def __call__(self):
            return _DummySession()

    dummy_engine = object()

    monkeypatch.setattr(
        db,
        "get_settings",
        lambda: SimpleNamespace(db_mode=db_mode, db_url=db_url),
    )
    monkeypatch.setattr(db, "create_async_engine", lambda *args, **kwargs: dummy_engine)
    monkeypatch.setattr(db, "async_sessionmaker", lambda *args, **kwargs: _DummyFactory())
    monkeypatch.setattr(db, "_engine", None, raising=False)
    monkeypatch.setattr(db, "_session_factory", None, raising=False)

    sessions: list[_DummySession] = []
    async with db.get_session() as session:
        sessions.append(session)

    assert sessions
    assert sessions[0].closed is True
