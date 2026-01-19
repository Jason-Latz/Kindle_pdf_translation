from __future__ import annotations

import json
import os

import pytest
from pydantic_core import ValidationError

from app.providers import (
    batched,
    chunk_by_tokens,
    estimate_token_count,
    get_translation_provider,
)
from app.providers.openai_provider import OpenAIProvider


def test_batched_chunks_into_fixed_sizes() -> None:
    assert list(batched(["a", "b", "c", "d", "e"], 2)) == [
        ["a", "b"],
        ["c", "d"],
        ["e"],
    ]


def test_batched_rejects_invalid_size() -> None:
    with pytest.raises(ValueError):
        list(batched(["a"], 0))


def test_estimate_token_count_uses_minimum_of_one() -> None:
    assert estimate_token_count("") == 1
    assert estimate_token_count("abcd") == 1
    assert estimate_token_count("abcde") == 2


def test_chunk_by_tokens_respects_budget() -> None:
    texts = ["a" * 10, "b" * 10, "c" * 10]
    batches = chunk_by_tokens(texts, max_tokens=20, reserved_tokens=4)
    assert sum(len(batch) for batch in batches) == len(texts)

    budget = 20 - 4
    for batch in batches:
        token_total = sum(estimate_token_count(item) for item in batch)
        assert token_total <= budget


def test_chunk_by_tokens_handles_oversized_paragraph() -> None:
    large = "a" * 100
    batches = chunk_by_tokens([large], max_tokens=20, reserved_tokens=4)
    assert batches == [[large]]


def test_chunk_by_tokens_respects_completion_budget() -> None:
    texts = ["a" * 40, "b" * 40, "c" * 40, "d" * 40]
    batches = chunk_by_tokens(
        texts,
        max_tokens=1000,
        reserved_tokens=0,
        max_completion_tokens=30,
        completion_ratio=1.0,
    )
    assert batches == [["a" * 40, "b" * 40, "c" * 40], ["d" * 40]]


def test_chunk_by_tokens_validates_inputs() -> None:
    with pytest.raises(ValueError):
        chunk_by_tokens(["a"], max_tokens=0)
    with pytest.raises(ValueError):
        chunk_by_tokens(["a"], max_tokens=10, reserved_tokens=-1)
    with pytest.raises(ValueError):
        chunk_by_tokens(["a"], max_tokens=10, reserved_tokens=11)
    with pytest.raises(ValueError):
        chunk_by_tokens(["a"], max_tokens=10, max_completion_tokens=0)
    with pytest.raises(ValueError):
        chunk_by_tokens(
            ["a"],
            max_tokens=10,
            max_completion_tokens=20,
            reserved_completion_tokens=25,
        )
    with pytest.raises(ValueError):
        chunk_by_tokens(
            ["a"],
            max_tokens=10,
            max_completion_tokens=10,
            reserved_completion_tokens=-1,
        )
    with pytest.raises(ValueError):
        chunk_by_tokens(
            ["a"],
            max_tokens=10,
            max_completion_tokens=10,
            reserved_completion_tokens=10,
        )
    with pytest.raises(ValueError):
        chunk_by_tokens(["a"], max_tokens=10, completion_ratio=0)


def test_get_translation_provider_requires_openai_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATOR_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "")

    with pytest.raises(RuntimeError):
        get_translation_provider()


def test_get_translation_provider_returns_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATOR_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    provider = get_translation_provider()

    assert isinstance(provider, OpenAIProvider)


def test_get_translation_provider_rejects_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATOR_PROVIDER", "unknown")

    with pytest.raises(ValidationError):
        get_translation_provider()


def test_chunk_by_tokens_flushes_current_when_next_is_too_large() -> None:
    batches = chunk_by_tokens(
        ["short", "x" * 100],
        max_tokens=10,
        reserved_tokens=0,
    )
    assert batches[0] == ["short"]
    assert batches[1] == ["x" * 100]


def test_chunk_by_tokens_flushes_on_completion_budget() -> None:
    batches = chunk_by_tokens(
        ["tiny", "x" * 80],
        max_tokens=200,
        reserved_tokens=0,
        max_completion_tokens=4,
        completion_ratio=1.0,
    )
    assert batches[0] == ["tiny"]
    assert batches[1] == ["x" * 80]


@pytest.mark.asyncio
async def test_get_translation_provider_returns_hf_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    hf_model_id = os.getenv("HF_MODEL_ID")
    if not hf_model_id:
        pytest.skip("HF_MODEL_ID not set; skipping Hugging Face provider test.")

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

    provider = get_translation_provider()

    paragraphs = ["hello world"]
    translated = await provider.translate_batch(paragraphs, src_lang="en", tgt_lang="es")

    assert translated == ["[es] hello world"]
