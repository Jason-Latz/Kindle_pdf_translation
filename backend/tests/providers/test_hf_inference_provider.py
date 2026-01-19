from __future__ import annotations

import json
import os

import pytest

from app.providers.hf_inference_provider import HFInferenceProvider

pytestmark = pytest.mark.skipif(
    not os.getenv("HF_MODEL_ID"),
    reason="HF_MODEL_ID not set; skipping Hugging Face provider tests.",
)


@pytest.mark.asyncio
async def test_hf_inference_provider_parses_translations(monkeypatch: pytest.MonkeyPatch) -> None:
    class _StubClient:
        def __init__(self, *args, **kwargs) -> None:
            return None

        async def text_generation(self, prompt: str, **kwargs) -> str:
            payload = json.loads(prompt.split("\n\n")[-1])
            translations = [f"[{payload['target_language']}] {text}" for text in payload["paragraphs"]]
            return json.dumps({"translations": translations})

    monkeypatch.setattr(
        "app.providers.hf_inference_provider.AsyncInferenceClient",
        _StubClient,
    )

    provider = HFInferenceProvider(model_id=os.getenv("HF_MODEL_ID", "dummy"))
    translations = await provider.translate_batch(["hello"], src_lang="en", tgt_lang="es")

    assert translations == ["[es] hello"]


def test_hf_parse_translations_handles_fenced_json() -> None:
    raw = "```json\n{\"translations\": [\"uno\"]}\n```"

    assert HFInferenceProvider._parse_translations(raw) == ["uno"]


def test_hf_parse_translations_rejects_non_json() -> None:
    with pytest.raises(RuntimeError):
        HFInferenceProvider._parse_translations("not-json")
