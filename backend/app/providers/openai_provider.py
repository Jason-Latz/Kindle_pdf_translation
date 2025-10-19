"""OpenAI-powered translation provider."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Sequence

from .base import TranslationProvider


class OpenAIProvider(TranslationProvider):
    """Translate text via the OpenAI API."""

    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.model = model

    async def translate_batch(
        self,
        texts: Iterable[str],
        *,
        src_lang: str,
        tgt_lang: str,
    ) -> Sequence[str]:
        """Translate a batch of paragraphs using OpenAI."""
        raise NotImplementedError("OpenAI translation not implemented yet")
