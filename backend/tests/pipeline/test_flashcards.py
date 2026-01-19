from __future__ import annotations

import csv
from collections import Counter

import pytest

from app.pipeline import flashcards


class _Token:
    def __init__(
        self,
        text: str,
        lemma: str,
        *,
        is_space: bool = False,
        is_punct: bool = False,
        like_num: bool = False,
        is_stop: bool = False,
    ) -> None:
        self.text = text
        self.lemma_ = lemma
        self.is_space = is_space
        self.is_punct = is_punct
        self.like_num = like_num
        self.is_stop = is_stop


class _Tokenizer:
    def __init__(self, docs):
        self._docs = docs

    def pipe(self, _paragraphs, disable=None):
        return self._docs


def test_iter_candidate_tokens_filters_noise(monkeypatch: pytest.MonkeyPatch) -> None:
    tokens = [
        _Token(" ", " ", is_space=True),
        _Token(".", ".", is_punct=True),
        _Token("123", "123", like_num=True),
        _Token("el", "el", is_stop=True),
        _Token("Hola", "hola"),
        _Token("yo", "-PRON-"),
        _Token("Texto", ""),
    ]
    tokenizer = _Tokenizer([tokens])
    monkeypatch.setattr(flashcards, "get_tokenizer", lambda _lang: tokenizer)

    results = list(flashcards._iter_candidate_tokens(["hola mundo"], "es"))

    assert results == ["hola", "yo", "texto"]


def test_count_token_frequencies(monkeypatch: pytest.MonkeyPatch) -> None:
    tokenizer = _Tokenizer([[_Token("Hola", "hola"), _Token("Hola", "hola")]])
    monkeypatch.setattr(flashcards, "get_tokenizer", lambda _lang: tokenizer)

    counts = flashcards._count_token_frequencies(["Hola Hola"], "es")

    assert counts == Counter({"hola": 2})


@pytest.mark.asyncio
async def test_generate_flashcards_writes_empty_header(tmp_path, monkeypatch) -> None:
    output_path = tmp_path / "cards.csv"
    monkeypatch.setattr(flashcards, "_count_token_frequencies", lambda *_args, **_kwargs: Counter())

    result = await flashcards.generate_flashcards([], output_path, language_code="es")

    assert result == output_path.resolve()
    with output_path.open("r", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    assert rows == [["word", "translation"]]


@pytest.mark.asyncio
async def test_generate_flashcards_translates_top_terms(tmp_path, monkeypatch) -> None:
    output_path = tmp_path / "cards.csv"
    monkeypatch.setattr(
        flashcards,
        "_count_token_frequencies",
        lambda *_args, **_kwargs: Counter({"hola": 2, "mundo": 1}),
    )
    monkeypatch.setattr(
        flashcards,
        "zipf_frequency",
        lambda word, _lang, wordlist="best": 1.0 if word == "hola" else 6.0,
    )

    class _Provider:
        async def translate_batch(self, words, *, src_lang, tgt_lang):
            return [f"{tgt_lang}:{word}" for word in words]

    monkeypatch.setattr(flashcards, "get_translation_provider", lambda: _Provider())

    await flashcards.generate_flashcards(["hola mundo"], output_path, language_code="es")

    with output_path.open("r", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    assert rows[0]["word"] == "hola"
    assert rows[0]["translation"] == "en:hola"
    assert rows[1]["word"] == "mundo"
    assert rows[1]["translation"] == "en:mundo"


@pytest.mark.asyncio
async def test_generate_flashcards_raises_on_mismatch(tmp_path, monkeypatch) -> None:
    output_path = tmp_path / "cards.csv"
    monkeypatch.setattr(
        flashcards,
        "_count_token_frequencies",
        lambda *_args, **_kwargs: Counter({"hola": 1, "mundo": 1}),
    )
    monkeypatch.setattr(flashcards, "zipf_frequency", lambda *_args, **_kwargs: 1.0)

    class _Provider:
        async def translate_batch(self, words, *, src_lang, tgt_lang):
            return ["uno"]

    monkeypatch.setattr(flashcards, "get_translation_provider", lambda: _Provider())

    with pytest.raises(RuntimeError):
        await flashcards.generate_flashcards(["hola mundo"], output_path, language_code="es")
