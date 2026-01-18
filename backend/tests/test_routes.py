from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import create_app
from app.routes import (
    _artifact_filename,
    _get_storage,
    _normalize_lang,
    _persist_initial_job,
)
from app.storage.local import LocalStorage


def test_normalize_lang_strips_and_lowercases() -> None:
    assert _normalize_lang(' "ES" ') == "es"
    assert _normalize_lang(" [Fr] ") == "fr"


def test_artifact_filename_prefers_original_name() -> None:
    assert _artifact_filename("book.pdf", ".epub", "fallback.epub") == "book.epub"
    assert _artifact_filename(None, ".epub", "fallback.epub") == "fallback.epub"


def test_get_storage_returns_local() -> None:
    settings = SimpleNamespace(storage_backend="local")
    storage = _get_storage(settings)
    assert isinstance(storage, LocalStorage)


def test_get_storage_rejects_missing_s3_credentials() -> None:
    settings = SimpleNamespace(
        storage_backend="s3",
        s3_access_key=None,
        s3_secret_key=None,
        s3_endpoint=None,
        s3_bucket="bucket",
    )

    with pytest.raises(HTTPException):
        _get_storage(settings)


def test_get_storage_rejects_unknown_backend() -> None:
    settings = SimpleNamespace(storage_backend="unknown")

    with pytest.raises(HTTPException):
        _get_storage(settings)


@pytest.mark.asyncio
async def test_persist_initial_job_sqlite(monkeypatch) -> None:
    class _Session:
        def __init__(self) -> None:
            self.added = None
            self.committed = False

        def add(self, job) -> None:
            self.added = job

        async def commit(self) -> None:
            self.committed = True

    session = _Session()

    @asynccontextmanager
    async def _get_session():
        yield session

    async def _ensure_schema() -> None:
        return None

    monkeypatch.setattr("app.routes.get_session", _get_session)
    monkeypatch.setattr("app.routes.ensure_schema", _ensure_schema)

    settings = SimpleNamespace(db_mode="sqlite")
    response = await _persist_initial_job(
        settings=settings,
        job_id="job1",
        filename="sample.pdf",
        tgt_lang="es",
        source_location="source.pdf",
    )

    assert response.job_id == "job1"
    assert session.added is not None
    assert session.committed is True


def test_create_job_rejects_unsupported_language(monkeypatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DB_MODE", "manifests")
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("TARGET_LANGS", "[\"es\",\"fr\"]")

    app = create_app()
    client = TestClient(app)

    response = client.post(
        "/api/jobs",
        data={"tgt_lang": "jp"},
        files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")},
    )

    assert response.status_code == 400


def test_create_job_writes_manifest(monkeypatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DB_MODE", "manifests")
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("TARGET_LANGS", "[\"es\"]")

    async def _noop_pipeline(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.routes.run_pipeline", _noop_pipeline)

    app = create_app()
    client = TestClient(app)

    response = client.post(
        "/api/jobs",
        data={"tgt_lang": "es"},
        files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")},
    )

    assert response.status_code == 202
    payload = response.json()
    manifest = Path("data/manifests") / f"{payload['job_id']}.json"
    assert manifest.exists()


def test_read_job_from_manifest(monkeypatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DB_MODE", "manifests")
    monkeypatch.setenv("STORAGE_BACKEND", "local")

    manifest = Path("data/manifests")
    manifest.mkdir(parents=True, exist_ok=True)
    job_id = "job123"
    (manifest / f"{job_id}.json").write_text(
        json.dumps({"id": job_id, "status": "queued", "stage": "queued", "pct": 0.0}),
        encoding="utf-8",
    )

    app = create_app()
    client = TestClient(app)

    response = client.get(f"/api/jobs/{job_id}")

    assert response.status_code == 200
    assert response.json()["job_id"] == job_id


def test_read_job_rejects_unknown_db_mode(monkeypatch) -> None:
    monkeypatch.setattr("app.routes.get_settings", lambda: SimpleNamespace(db_mode="unknown"))

    app = create_app()
    client = TestClient(app)

    response = client.get("/api/jobs/job123")

    assert response.status_code == 500


def test_download_artifact_from_manifest(monkeypatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DB_MODE", "manifests")
    monkeypatch.setenv("STORAGE_BACKEND", "local")

    job_id = "job123"
    artifact_path = Path("data/artifacts") / job_id / "sample.epub"
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_bytes(b"epub-data")

    manifest_path = Path("data/manifests") / f"{job_id}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(
            {
                "id": job_id,
                "filename": "sample.pdf",
                "epub_path": str(artifact_path),
                "cards_path": None,
            }
        ),
        encoding="utf-8",
    )

    app = create_app()
    client = TestClient(app)

    response = client.get(f"/api/jobs/{job_id}/download?file_type=epub")

    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="sample.epub"'
    assert response.content == b"epub-data"


def test_download_artifact_rejects_invalid_type(monkeypatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DB_MODE", "manifests")
    monkeypatch.setenv("STORAGE_BACKEND", "local")

    app = create_app()
    client = TestClient(app)

    response = client.get("/api/jobs/job123/download?file_type=unknown")

    assert response.status_code == 400
