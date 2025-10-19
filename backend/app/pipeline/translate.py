"""Translation stage helpers."""

from __future__ import annotations

from collections.abc import Iterable


async def translate_paragraphs(paragraphs: Iterable[str], src_lang: str, tgt_lang: str) -> list[str]:
    """Translate source paragraphs to the requested language."""
    raise NotImplementedError("Translation stage not implemented yet")


__all__ = ("translate_paragraphs",)
