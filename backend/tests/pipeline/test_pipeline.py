from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from app.pipeline import PipelineContext, run_pipeline


SAMPLE_PDF = Path(__file__).resolve().parents[3] / "sample_paragraphs.pdf"


@pytest.mark.asyncio
async def test_run_pipeline_persists_paragraphs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    hf_model_id = os.getenv("HF_MODEL_ID")
    if not hf_model_id:
        pytest.skip("HF_MODEL_ID not set; skipping Hugging Face pipeline test.")

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("DB_MODE", "manifests")
    monkeypatch.setenv("TRANSLATOR_PROVIDER", "hf")
    monkeypatch.setenv("HF_MODEL_ID", hf_model_id)

    class _StubInferenceClient:
        def __init__(self, *args, **kwargs) -> None:
            self.calls = []

        async def text_generation(self, prompt: str, **kwargs) -> str:
            self.calls.append({"prompt": prompt, **kwargs})
            payload = json.loads(prompt.split("\n\n")[-1])
            translations = [f"[{payload['target_language']}] {text}" for text in payload["paragraphs"]]
            return json.dumps({"translations": translations})

    monkeypatch.setattr(
        "app.providers.hf_inference_provider.AsyncInferenceClient",
        _StubInferenceClient,
    )

    job_id = "job123"
    uploaded_name = "sample_paragraphs.pdf"
    source_pdf = tmp_path / "sample_paragraphs.pdf"
    source_pdf.write_bytes(SAMPLE_PDF.read_bytes())

    from app.db import manifest_path

    manifest = manifest_path(job_id)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(
        json.dumps(
            {
                "id": job_id,
                "filename": uploaded_name,
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

    context = PipelineContext(job_id=job_id, source_path=str(source_pdf), target_lang="es")
    await run_pipeline(context)

    paragraphs_path = Path("data/artifacts") / job_id / "paragraphs.json"
    assert paragraphs_path.exists()
    payload = json.loads(paragraphs_path.read_text(encoding="utf-8"))
    assert len(payload["paragraphs"]) == 5
    assert payload["paragraphs"][0].startswith("Lorem ipsum")
    assert payload["paragraphs"][-1].startswith("Proin leo ipsum")

    artifact_base = Path(uploaded_name).stem
    epub_path = Path("data/artifacts") / job_id / f"{artifact_base}.epub"
    assert epub_path.exists()

    translations_path = Path("data/artifacts") / job_id / "translated_paragraphs.json"
    assert translations_path.exists()
    translations_payload = json.loads(translations_path.read_text(encoding="utf-8"))
    assert translations_payload["target_language"] == "es"
    assert len(translations_payload["paragraphs"]) == len(payload["paragraphs"])
    assert translations_payload["paragraphs"][0].startswith("[es]")

    manifest_payload = json.loads(manifest.read_text(encoding="utf-8"))
    assert manifest_payload["status"] == "done"
    assert manifest_payload["stage"] == "finalize"
    assert manifest_payload["epub_path"]
    assert manifest_payload.get("paragraphs_path")
    assert manifest_payload.get("translations_path")
    timings = manifest_payload.get("timings_ms")
    assert isinstance(timings, dict)
    assert timings.get("extract") is not None
    assert timings.get("translate") is not None
    assert timings.get("build_epub") is not None
    assert timings.get("flashcards") is not None
