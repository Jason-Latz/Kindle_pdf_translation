"""Base translation abstractions and helper utilities."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable, Iterator, Sequence

from ..config import Settings, get_settings

DEFAULT_MAX_TOKENS = 4000
RESERVED_COMPLETION_TOKENS = 500


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


def get_translation_provider(settings: Settings | None = None) -> TranslationProvider:
    """Return the configured translation provider instance."""
    cfg = settings or get_settings()

    if cfg.translator_provider == "openai":
        if not cfg.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for the OpenAI provider")
        from .openai_provider import OpenAIProvider  # avoid circular import

        return OpenAIProvider(api_key=cfg.openai_api_key)

    if cfg.translator_provider == "hf":
        from .hf_stub_provider import HFStubProvider  # avoid circular import

        return HFStubProvider()

    raise RuntimeError(f"Unsupported translator provider '{cfg.translator_provider}'")


def batched(iterable: Sequence[str], batch_size: int) -> Iterator[list[str]]:
    """Yield fixed-size batches from `iterable`."""
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    for start in range(0, len(iterable), batch_size):
        yield list(iterable[start : start + batch_size])


def estimate_token_count(text: str) -> int:
    """Heuristic tokenizer using 4 characters ≈ 1 token."""
    return max(1, (len(text) + 3) // 4)


def chunk_by_tokens(
    texts: Sequence[str],
    *,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    reserved_tokens: int = RESERVED_COMPLETION_TOKENS,
    max_completion_tokens: int | None = None,
    reserved_completion_tokens: int = 0,
    completion_ratio: float = 1.0,
) -> list[list[str]]:
    """
    Split texts into batches that respect a token budget.

    `reserved_tokens` leaves room for completions to avoid hitting the cap.
    """
    if max_tokens <= 0:
        raise ValueError("max_tokens must be positive")
    if reserved_tokens < 0:
        raise ValueError("reserved_tokens cannot be negative")
    if completion_ratio <= 0:
        raise ValueError("completion_ratio must be positive")

    budget = max_tokens - reserved_tokens
    if budget <= 0:
        raise ValueError("reserved_tokens leaves no room for prompts")

    completion_budget: int | None = None
    if max_completion_tokens is not None:
        if max_completion_tokens <= 0:
            raise ValueError("max_completion_tokens must be positive")
        if reserved_completion_tokens < 0:
            raise ValueError("reserved_completion_tokens cannot be negative")
        completion_budget = max_completion_tokens - reserved_completion_tokens
        if completion_budget <= 0:
            raise ValueError("reserved_completion_tokens leaves no room for completions")

    batches: list[list[str]] = []
    current: list[str] = []
    current_tokens = 0
    current_completion_tokens = 0

    for text in texts:
        tokens = estimate_token_count(text)
        completion_tokens = (
            max(1, int(round(tokens * completion_ratio))) if completion_budget is not None else 0
        )

        if tokens > budget:
            # Single paragraph exceeds the prompt budget; force its own batch
            if current:
                batches.append(current)
                current = []
                current_tokens = 0
                current_completion_tokens = 0
            batches.append([text])
            continue
        if completion_budget is not None and completion_tokens > completion_budget:
            if current:
                batches.append(current)
                current = []
                current_tokens = 0
                current_completion_tokens = 0
            batches.append([text])
            continue

        if current and (
            current_tokens + tokens > budget
            or (
                completion_budget is not None
                and current_completion_tokens + completion_tokens > completion_budget
            )
        ):
            batches.append(current)
            current = []
            current_tokens = 0
            current_completion_tokens = 0

        current.append(text)
        current_tokens += tokens
        if completion_budget is not None:
            current_completion_tokens += completion_tokens

    if current:
        batches.append(current)

    return batches


__all__ = (
    "TranslationProvider",
    "get_translation_provider",
    "batched",
    "estimate_token_count",
    "chunk_by_tokens",
    "DEFAULT_MAX_TOKENS",
    "RESERVED_COMPLETION_TOKENS",
)
