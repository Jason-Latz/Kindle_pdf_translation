"""Lightweight Hugging Face stub provider for Apple Silicon development."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Sequence

from .base import TranslationProvider


class HFStubProvider(TranslationProvider):
    """Return deterministic placeholder translations for local testing."""

    async def translate_batch(
        self,
        texts: Iterable[str],
        *,
        src_lang: str,
        tgt_lang: str,
    ) -> Sequence[str]:
        """Echo the input with a prefix to indicate stubbed output."""
        return [f"[{tgt_lang}] {text}" for text in texts]
