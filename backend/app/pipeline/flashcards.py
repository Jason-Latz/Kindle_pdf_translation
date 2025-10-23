"""Flashcard generation stage."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path
from typing import Iterable, Sequence

from wordfreq import zipf_frequency

from ..utils import get_tokenizer

MAX_FLASHCARDS = 30


def _normalise_token(text: str) -> str:
    """Return a normalised token key for frequency analysis."""
    return text.casefold()


def _iter_candidate_tokens(paragraphs: Sequence[str], language_code: str) -> Iterable[str]:
    """Yield token strings considered for flashcard generation."""
    tokenizer = get_tokenizer(language_code)

    for doc in tokenizer.pipe(paragraphs, disable=["parser", "ner", "textcat"]):
        for token in doc:
            if token.is_space or token.is_punct or token.like_num:
                continue
            if token.is_stop:
                continue

            lemma = token.lemma_.strip()
            if lemma and lemma != "-PRON-":
                yield _normalise_token(lemma)
            else:
                yield _normalise_token(token.text)


def _count_token_frequencies(paragraphs: Sequence[str], language_code: str) -> Counter[str]:
    """Return token frequencies across the translated text."""
    return Counter(_iter_candidate_tokens(paragraphs, language_code))


async def generate_flashcards(
    paragraphs: Sequence[str],
    output_path: Path,
    *,
    language_code: str,
) -> Path:
    """Create a vocabulary CSV for the translated content."""
    frequencies = _count_token_frequencies(paragraphs, language_code)
    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "word",
                "count",
                "zipf_frequency",
                "rarity_weight",
                "score",
            ],
        )
        writer.writeheader()

        if not frequencies:
            return output_path

        scored_rows: list[tuple[str, int, float, float, float]] = []
        for word, count in frequencies.items():
            zipf = float(zipf_frequency(word, language_code, wordlist="best"))
            rarity_weight = max(0.0, 7.0 - zipf)
            score = count * (1.0 + rarity_weight)
            scored_rows.append((word, count, zipf, rarity_weight, score))

        scored_rows.sort(key=lambda item: (item[4], item[1]), reverse=True)
        top_rows = scored_rows[:MAX_FLASHCARDS]

        for word, count, zipf, rarity_weight, score in top_rows:
            writer.writerow(
                {
                    "word": word,
                    "count": count,
                    "zipf_frequency": f"{zipf:.3f}",
                    "rarity_weight": f"{rarity_weight:.3f}",
                    "score": f"{score:.3f}",
                }
            )

    return output_path


__all__ = ("generate_flashcards", "_count_token_frequencies")
