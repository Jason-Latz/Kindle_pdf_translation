from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

from app.utils import tokenizers


def _clear_cache() -> None:
    tokenizers.get_tokenizer.cache_clear()


def test_get_tokenizer_prefers_preferred_model(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_cache()

    expected = SimpleNamespace(name="preferred")
    calls: list[str] = []

    def _load(name: str):
        calls.append(name)
        return expected

    def _blank(lang: str):  # pragma: no cover - should not be called
        raise AssertionError("spacy.blank should not be called when preferred model loads")

    monkeypatch.setattr(tokenizers.spacy, "load", _load)
    monkeypatch.setattr(tokenizers.spacy, "blank", _blank)

    result = tokenizers.get_tokenizer("en", preferred_model="custom_model")

    assert result is expected
    assert calls == ["custom_model"]


def test_get_tokenizer_falls_back_to_blank(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_cache()

    calls: list[str] = []

    def _load(name: str):
        calls.append(name)
        raise RuntimeError("missing model")

    expected = SimpleNamespace(name="blank-en")

    def _blank(lang: str):
        calls.append(f"blank:{lang}")
        return expected

    monkeypatch.setattr(tokenizers.spacy, "load", _load)
    monkeypatch.setattr(tokenizers.spacy, "blank", _blank)

    result = tokenizers.get_tokenizer("EN")

    assert result is expected
    assert calls == [
        "en_core_news_sm",
        "en_core_web_sm",
        "xx_sent_ud_sm",
        "blank:en",
    ]


def test_get_tokenizer_falls_back_to_multilingual(monkeypatch: pytest.MonkeyPatch, caplog) -> None:
    _clear_cache()

    def _load(name: str):
        raise RuntimeError("missing model")

    calls: list[str] = []
    expected = SimpleNamespace(name="blank-xx")

    def _blank(lang: str):
        calls.append(lang)
        if lang != "xx":
            raise ValueError("unsupported language")
        return expected

    monkeypatch.setattr(tokenizers.spacy, "load", _load)
    monkeypatch.setattr(tokenizers.spacy, "blank", _blank)

    with caplog.at_level(logging.WARNING):
        result = tokenizers.get_tokenizer("zz")

    assert result is expected
    assert calls == ["zz", "xx"]
    assert any("Falling back to spaCy 'xx' tokenizer" in record.message for record in caplog.records)
