from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.pipeline import translate
from app.storage.local import LocalStorage


@pytest.mark.asyncio
async def test_translate_paragraphs_requires_input(tmp_path) -> None:
    storage = LocalStorage(tmp_path / "data")

    with pytest.raises(ValueError):
        await translate.translate_paragraphs("job1", storage, target_lang="es")


@pytest.mark.asyncio
async def test_translate_paragraphs_handles_empty(tmp_path) -> None:
    storage = LocalStorage(tmp_path / "data")

    translations, location = await translate.translate_paragraphs(
        "job1",
        storage,
        target_lang="es",
        paragraphs=[],
    )

    assert translations == []
    payload = json.loads(Path(location).read_text(encoding="utf-8"))
    assert payload["paragraphs"] == []
    assert payload["target_language"] == "es"


@pytest.mark.asyncio
async def test_translate_paragraphs_loads_from_location(tmp_path, monkeypatch) -> None:
    storage = LocalStorage(tmp_path / "data")
    location = tmp_path / "paragraphs.json"
    location.write_text(json.dumps({"paragraphs": ["a", "b"]}), encoding="utf-8")

    class _Provider:
        def __init__(self) -> None:
            self.calls = []

        async def translate_batch(self, texts, *, src_lang, tgt_lang):
            self.calls.append((list(texts), src_lang, tgt_lang))
            return [f"{tgt_lang}:{text}" for text in texts]

    provider = _Provider()

    monkeypatch.setattr(translate, "get_translation_provider", lambda: provider)
    monkeypatch.setattr(translate, "chunk_by_tokens", lambda *_args, **_kwargs: [["a"], ["b"]])

    progress: list[float] = []

    async def _progress(value: float) -> None:
        progress.append(value)

    translations, location_out = await translate.translate_paragraphs(
        "job1",
        storage,
        target_lang="es",
        source_lang="en",
        paragraphs_location=str(location),
        progress_callback=_progress,
    )

    assert translations == ["es:a", "es:b"]
    assert provider.calls == [(["a"], "en", "es"), (["b"], "en", "es")]
    assert progress == [0.0, 0.5, 1.0]
    assert Path(location_out).exists()


@pytest.mark.asyncio
async def test_translate_paragraphs_rejects_invalid_payload(tmp_path) -> None:
    storage = LocalStorage(tmp_path / "data")
    location = tmp_path / "paragraphs.json"
    location.write_text(json.dumps({"paragraphs": "nope"}), encoding="utf-8")

    with pytest.raises(ValueError):
        await translate.translate_paragraphs(
            "job1",
            storage,
            target_lang="es",
            paragraphs_location=str(location),
        )
