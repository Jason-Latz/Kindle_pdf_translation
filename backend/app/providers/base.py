"""Base interface for translation providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable
from typing import Sequence


class TranslationProvider(ABC):
    """Strategy interface for translating batches of text."""

    @abstractmethod
    async def translate_batch(
        self,
        texts: Iterable[str],
        *,
        src_lang: str,
        tgt_lang: str,
    ) -> Sequence[str]:
        """Translate a batch of strings."""
