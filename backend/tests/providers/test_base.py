from __future__ import annotations

import pytest

from app.providers import (
    batched,
    chunk_by_tokens,
    estimate_token_count,
    get_translation_provider,
)


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


def test_chunk_by_tokens_validates_inputs() -> None:
    with pytest.raises(ValueError):
        chunk_by_tokens(["a"], max_tokens=0)
    with pytest.raises(ValueError):
        chunk_by_tokens(["a"], max_tokens=10, reserved_tokens=11)


def test_get_translation_provider_requires_openai_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATOR_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "")

    with pytest.raises(RuntimeError):
        get_translation_provider()


@pytest.mark.asyncio
async def test_get_translation_provider_returns_stub(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATOR_PROVIDER", "hf")
    provider = get_translation_provider()

    paragraphs = ["hello world"]
    translated = await provider.translate_batch(paragraphs, src_lang="en", tgt_lang="es")

    assert translated == ["[es] hello world"]
