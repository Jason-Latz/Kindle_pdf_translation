from __future__ import annotations

import os
import re
from pathlib import Path

import pytest
from dotenv import dotenv_values

from app.providers import get_translation_provider
from app.config import get_settings


FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "accuracy"
SOURCE_PATH = FIXTURES_DIR / "source_en.txt"
TARGET_PATH = FIXTURES_DIR / "target_es.txt"
_TOKEN_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+", re.UNICODE)
_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
_ENV_VALUES = dotenv_values(_ENV_PATH) if _ENV_PATH.is_file() else {}


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


def _env_value(name: str) -> str | None:
    return os.getenv(name) or _ENV_VALUES.get(name)


def _get_accuracy_provider():
    if _env_value("TRANSLATION_ACCURACY") != "1":
        pytest.skip("Set TRANSLATION_ACCURACY=1 to run reference translation checks.")

    settings = get_settings()
    if settings.translator_provider == "openai":
        if not settings.openai_api_key:
            pytest.skip("OPENAI_API_KEY is required for OpenAI accuracy checks.")
    elif settings.translator_provider == "hf":
        if not settings.hf_model_id:
            pytest.skip("HF_MODEL_ID is required for Hugging Face accuracy checks.")
    else:
        pytest.skip(f"Unsupported translator provider '{settings.translator_provider}'.")

    return get_translation_provider(settings)


@pytest.mark.accuracy
@pytest.mark.asyncio
async def test_translation_accuracy_against_reference_pairs() -> None:
    provider = _get_accuracy_provider()

    source_paragraphs = _load_paragraphs(SOURCE_PATH)
    reference_paragraphs = _load_paragraphs(TARGET_PATH)
    assert len(source_paragraphs) == len(reference_paragraphs)

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


@pytest.mark.accuracy
@pytest.mark.asyncio
async def test_translation_bleu_against_reference_pairs() -> None:
    provider = _get_accuracy_provider()

    sacrebleu = pytest.importorskip("sacrebleu")

    source_paragraphs = _load_paragraphs(SOURCE_PATH)
    reference_paragraphs = _load_paragraphs(TARGET_PATH)
    assert len(source_paragraphs) == len(reference_paragraphs)

    translated = await provider.translate_batch(
        source_paragraphs,
        src_lang="en",
        tgt_lang="es",
    )
    assert len(translated) == len(reference_paragraphs)

    bleu = sacrebleu.corpus_bleu(translated, [reference_paragraphs], tokenize="intl")
    assert bleu.score >= 10.0
