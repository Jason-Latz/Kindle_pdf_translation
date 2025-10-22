from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.providers.openai_provider import OpenAIProvider


class _DummyResponses:
    def __init__(self, outputs: list[list[str]]):
        self._outputs = outputs
        self.calls: list[dict[str, Any]] = []
        self._index = 0

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        payload = self._outputs[self._index]
        self._index += 1
        content = [
            SimpleNamespace(
                content=[
                    SimpleNamespace(type="output_text", text=json.dumps({"translations": payload}, ensure_ascii=False))
                ]
            )
        ]
        return SimpleNamespace(output=content, output_text=None)


class _DummyClient:
    def __init__(self, outputs: list[list[str]]):
        self.responses = _DummyResponses(outputs)


def _patch_client(monkeypatch: pytest.MonkeyPatch, outputs: list[list[str]]) -> None:
    def _factory(*args, **kwargs):
        return _DummyClient(outputs)

    monkeypatch.setattr("app.providers.openai_provider.AsyncOpenAI", _factory)


@pytest.mark.asyncio
async def test_translate_batch_handles_small_chunks(monkeypatch: pytest.MonkeyPatch) -> None:
    paragraphs = [
        "Paragraph one.",
        "Paragraph two.",
        "Paragraph three.",
    ]
    outputs = [["Uno", "Dos", "Tres"]]
    _patch_client(monkeypatch, outputs)

    provider = OpenAIProvider(
        api_key="test",
        model="gpt-test",
        max_input_tokens=20,
        reserved_completion_tokens=2,
    )

    result = await provider.translate_batch(paragraphs, src_lang="en", tgt_lang="es")

    assert result == ["Uno", "Dos", "Tres"]


@pytest.mark.asyncio
async def test_translate_batch_raises_on_mismatched_lengths(monkeypatch: pytest.MonkeyPatch) -> None:
    paragraphs = ["One", "Two"]
    outputs = [["Uno"]]
    _patch_client(monkeypatch, outputs)

    provider = OpenAIProvider(
        api_key="test",
        model="gpt-test",
        max_input_tokens=50,
        reserved_completion_tokens=10,
    )

    with pytest.raises(RuntimeError):
        await provider.translate_batch(paragraphs, src_lang="en", tgt_lang="es")


@pytest.mark.asyncio
async def test_translate_batch_rejects_non_json(monkeypatch: pytest.MonkeyPatch) -> None:
    paragraphs = ["One"]

    class _BadResponses:
        def __init__(self):
            self.calls = []

        async def create(self, **kwargs):
            self.calls.append(kwargs)
            return SimpleNamespace(output_text="not-json")

    class _BadClient:
        def __init__(self):
            self.responses = _BadResponses()

    monkeypatch.setattr(
        "app.providers.openai_provider.AsyncOpenAI",
        lambda *args, **kwargs: _BadClient(),
    )

    provider = OpenAIProvider(api_key="test")

    with pytest.raises(RuntimeError):
        await provider.translate_batch(paragraphs, src_lang="en", tgt_lang="es")
