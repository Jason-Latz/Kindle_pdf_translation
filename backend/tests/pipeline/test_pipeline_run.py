from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import pipeline as pipeline_module
from app.pipeline import PipelineContext, run_pipeline
from app.storage.local import LocalStorage


def test_get_storage_returns_local() -> None:
    settings = SimpleNamespace(storage_backend="local")

    storage = pipeline_module._get_storage(settings)

    assert isinstance(storage, LocalStorage)


def test_get_storage_rejects_missing_s3_credentials() -> None:
    settings = SimpleNamespace(
        storage_backend="s3",
        s3_access_key=None,
        s3_secret_key=None,
        s3_endpoint=None,
        s3_bucket="bucket",
    )

    with pytest.raises(RuntimeError):
        pipeline_module._get_storage(settings)


def test_get_storage_rejects_unknown_backend() -> None:
    settings = SimpleNamespace(storage_backend="unknown")

    with pytest.raises(RuntimeError):
        pipeline_module._get_storage(settings)


def test_resolve_source_pdf_local(tmp_path) -> None:
    source = tmp_path / "source.pdf"
    source.write_bytes(b"%PDF-1.4")
    storage = LocalStorage(tmp_path / "data")

    resolved, tmp_dir = pipeline_module._resolve_source_pdf(storage, str(source), "job1")

    assert resolved == source
    assert tmp_dir is None


def test_resolve_source_pdf_missing_raises(tmp_path) -> None:
    storage = LocalStorage(tmp_path / "data")

    with pytest.raises(FileNotFoundError):
        pipeline_module._resolve_source_pdf(storage, str(tmp_path / "missing.pdf"), "job1")


def test_artifact_base_name_falls_back_to_job_id() -> None:
    context = PipelineContext(job_id="job123", source_path=".", target_lang="es")

    assert pipeline_module._artifact_base_name(context) == "job123"


def test_epub_metadata_uses_pdf_metadata(monkeypatch, tmp_path) -> None:
    source = tmp_path / "source.pdf"
    source.write_bytes(b"%PDF-1.4")

    monkeypatch.setattr(
        pipeline_module,
        "_read_pdf_metadata",
        lambda _path: {"title": "Doc Title", "author": "Doc Author"},
    )

    context = PipelineContext(job_id="job1", source_path=str(source), target_lang="es")
    metadata = pipeline_module._epub_metadata_for_context(context, source)

    assert metadata["title"] == "Doc Title"
    assert metadata["chapter_title"] == "Doc Title"
    assert metadata["author"] == "Doc Author"
    assert metadata["language"] == "es"
    assert metadata["identifier"] == "job1"


@pytest.mark.asyncio
async def test_update_job_state_missing_manifest(monkeypatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DB_MODE", "manifests")

    await pipeline_module._update_job_state("missing-job", status="done")


@pytest.mark.asyncio
async def test_run_pipeline_writes_artifacts(monkeypatch, tmp_path) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("DB_MODE", "manifests")
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("TRANSLATOR_PROVIDER", "openai")

    job_id = "job123"
    source_pdf = tmp_path / "sample.pdf"
    source_pdf.write_bytes(b"%PDF-1.4")

    manifest = pipeline_module.manifest_path(job_id)
    manifest.write_text(
        json.dumps(
            {
                "id": job_id,
                "filename": "sample.pdf",
                "tgt_lang": "es",
                "status": "queued",
                "pct": 0.0,
                "stage": "queued",
                "source": str(source_pdf),
                "error": None,
            }
        ),
        encoding="utf-8",
    )

    async def _extract_paragraphs(_path: Path):
        return ["one", "two"]

    async def _translate_paragraphs(*_args, **_kwargs):
        translations = ["uno", "dos"]
        location = str(Path("data/artifacts") / job_id / "translated_paragraphs.json")
        return translations, location

    async def _build_epub(_paragraphs, output_path: Path, _metadata):
        output_path.write_bytes(b"epub")
        return output_path

    async def _generate_flashcards(_paragraphs, output_path: Path, **_kwargs):
        output_path.write_text("word,translation\nuno,one\n", encoding="utf-8")
        return output_path

    monkeypatch.setattr(pipeline_module, "extract_paragraphs", _extract_paragraphs)
    monkeypatch.setattr(pipeline_module, "translate_paragraphs", _translate_paragraphs)
    monkeypatch.setattr(pipeline_module, "build_epub", _build_epub)
    monkeypatch.setattr(pipeline_module, "generate_flashcards", _generate_flashcards)
    monkeypatch.setattr(pipeline_module, "_read_pdf_metadata", lambda _path: {})

    context = PipelineContext(job_id=job_id, source_path=str(source_pdf), target_lang="es")
    await run_pipeline(context)

    epub_path = Path("data/artifacts") / job_id / "sample.epub"
    flashcards_path = Path("data/artifacts") / job_id / "sample.csv"
    paragraphs_path = Path("data/artifacts") / job_id / "paragraphs.json"

    assert epub_path.exists()
    assert flashcards_path.exists()
    assert paragraphs_path.exists()

    payload = json.loads(manifest.read_text(encoding="utf-8"))
    assert payload["status"] == "done"
    assert payload["stage"] == "finalize"
    assert payload.get("paragraphs_path")
    assert payload.get("translations_path")
    assert payload.get("flashcards_path")
    assert payload.get("timings_ms")
