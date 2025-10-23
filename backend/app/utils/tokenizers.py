"""spaCy-backed tokenization helpers."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Iterable

import spacy
from spacy.language import Language

logger = logging.getLogger(__name__)


@lru_cache(maxsize=32)
def get_tokenizer(language_code: str, preferred_model: str | None = None) -> Language:
    """Return a cached spaCy pipeline for tokenization.

    The loader first tries the `preferred_model` (if provided), then a set of
    language-specific small core models, falling back to `spacy.blank(lang)`
    when the model is unavailable. A final fallback uses the multilingual
    `xx` rules so we always return a usable tokenizer.
    """
    lang = (language_code or "xx").lower()
    candidates: Iterable[str] = []

    if preferred_model:
        candidates = [preferred_model]
    else:
        candidates = [
            f"{lang}_core_news_sm",
            f"{lang}_core_web_sm",
            "xx_sent_ud_sm",
        ]

    for name in candidates:
        try:
            return spacy.load(name)
        except Exception:  # pragma: no cover - optional dependency
            logger.debug("Failed to load spaCy model '%s' for %s", name, lang)

    try:
        return spacy.blank(lang)
    except Exception:  # pragma: no cover - language unsupported
        logger.warning(
            "Falling back to spaCy 'xx' tokenizer for unsupported language '%s'", lang
        )
        return spacy.blank("xx")


__all__ = ("get_tokenizer",)
