"""Pytest configuration and shared fixtures for the backend test suite."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterator

import pytest

# Ensure `app.*` imports resolve when pytest is launched from the repo root.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(autouse=True)
def _reset_settings_cache() -> Iterator[None]:
    """
    Clear the cached settings object before and after each test.

    Tests freely monkeypatch environment variables, so we need a fresh
    `Settings` instance to observe those overrides.
    """
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        yield
    finally:
        get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _reset_db_state(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Reset the module-level SQLAlchemy engine/session cache between tests.

    Each test that exercises `app.db` should start from a clean slate.
    """
    from app import db as db_module

    monkeypatch.setattr(db_module, "_engine", None, raising=False)
    monkeypatch.setattr(db_module, "_session_factory", None, raising=False)
