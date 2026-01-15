from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

from app.providers import get_translation_provider


FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "accuracy"
SOURCE_PATH = FIXTURES_DIR / "source_en.txt"
TARGET_PATH = FIXTURES_DIR / "target_es.txt"
_TOKEN_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+", re.UNICODE)


def _load_paragraphs(path: Path) -> list[str]:
    content = path.read_text(encoding="utf-8").strip()
    return [chunk.strip() for chunk in content.split("\n\n") if chunk.strip()]


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in _TOKEN_RE.findall(text)]


def _jaccard_similarity(a: str, b: str) -> float:
    tokens_a = set(_tokenize(a))
    tokens_b = set(_tokenize(b))
    if not tokens_a and not tokens_b:
        return 1.0
    if not tokens_a or not tokens_b:
        return 0.0
    return len(tokens_a & tokens_b) / len(tokens_a | tokens_b)


@pytest.mark.accuracy
@pytest.mark.asyncio
async def test_translation_accuracy_against_reference_pairs() -> None:
    if os.getenv("TRANSLATION_ACCURACY") != "1":
        pytest.skip("Set TRANSLATION_ACCURACY=1 to run reference translation checks.")

    provider_name = os.getenv("TRANSLATOR_PROVIDER", "hf")
    if provider_name == "hf":
        pytest.skip("Accuracy checks require a real translation provider (not hf stub).")

    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY is required for accuracy checks.")

    source_paragraphs = _load_paragraphs(SOURCE_PATH)
    reference_paragraphs = _load_paragraphs(TARGET_PATH)
    assert len(source_paragraphs) == len(reference_paragraphs)

    provider = get_translation_provider()
    translated = await provider.translate_batch(
        source_paragraphs,
        src_lang="en",
        tgt_lang="es",
    )
    assert len(translated) == len(reference_paragraphs)

    similarities = [
        _jaccard_similarity(result, reference)
        for result, reference in zip(translated, reference_paragraphs)
    ]
    assert min(similarities) >= 0.45
    assert sum(similarities) / len(similarities) >= 0.6
