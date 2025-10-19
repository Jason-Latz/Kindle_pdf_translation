from __future__ import annotations

from pathlib import Path

import pytest

from app.utils.ids import new_job_id
from app.utils.locks import job_lock
from app.utils.logging import configure_logging


def test_new_job_id_returns_unique_hex_strings() -> None:
    first = new_job_id()
    second = new_job_id()

    assert isinstance(first, str)
    assert isinstance(second, str)
    assert len(first) == 16
    assert len(second) == 16
    assert first != second  # extremely unlikely to fail randomly
    int(first, 16)  # ensure valid hex
    int(second, 16)


def test_job_lock_context_manager_yields_control() -> None:
    with job_lock("example-job") as value:
        assert value is None


def test_configure_logging_creates_log_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)

    logger = configure_logging("job123")
    log_path = Path("data/logs/job123.log")

    assert log_path.exists()
    assert any(handler.baseFilename == str(log_path) for handler in logger.handlers if hasattr(handler, "baseFilename"))

    logger.info("hello from test")
    with log_path.open("r", encoding="utf-8") as fh:
        contents = fh.read()
    assert "hello from test" in contents
