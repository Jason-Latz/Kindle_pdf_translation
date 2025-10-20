"""OpenAI-powered translation provider."""

from __future__ import annotations

import json
from collections.abc import Iterable, Sequence
from typing import Any

from openai import AsyncOpenAI

from .base import (
    DEFAULT_MAX_TOKENS,
    RESERVED_COMPLETION_TOKENS,
    TranslationProvider,
    chunk_by_tokens,
)

SYSTEM_PROMPT = (
    "You are a professional literary translator. "
    "Translate each paragraph you are given from the source language to the target language. "
    "Return only a JSON array of translated paragraphs in the same order."
)


class OpenAIProvider(TranslationProvider):
    """Translate text via the OpenAI API."""

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "gpt-4o-mini",
        max_input_tokens: int = DEFAULT_MAX_TOKENS,
        reserved_completion_tokens: int = RESERVED_COMPLETION_TOKENS,
        max_output_tokens: int = 2048,
    ) -> None:
        self.model = model
        self.max_input_tokens = max_input_tokens
        self.reserved_completion_tokens = reserved_completion_tokens
        self.max_output_tokens = max_output_tokens
        self._client = AsyncOpenAI(api_key=api_key)

    async def translate_batch(
        self,
        texts: Iterable[str],
        *,
        src_lang: str,
        tgt_lang: str,
    ) -> Sequence[str]:
        """Translate a batch of paragraphs using OpenAI."""
        paragraphs = list(texts)
        if not paragraphs:
            return []

        batches = chunk_by_tokens(
            paragraphs,
            max_tokens=self.max_input_tokens,
            reserved_tokens=self.reserved_completion_tokens,
        )

        translations: list[str] = []
        for batch in batches:
            response = await self._client.responses.create(
                model=self.model,
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": self._build_user_prompt(batch, src_lang, tgt_lang),
                    },
                ],
                temperature=0,
                max_output_tokens=self.max_output_tokens,
            )
            batch_translations = self._extract_translations(response)
            if len(batch_translations) != len(batch):
                raise RuntimeError(
                    "OpenAI returned a mismatched number of translations "
                    f"(expected {len(batch)}, received {len(batch_translations)})"
                )
            translations.extend(batch_translations)

        return translations

    def _build_user_prompt(
        self,
        paragraphs: Sequence[str],
        src_lang: str,
        tgt_lang: str,
    ) -> str:
        payload = {
            "source_language": src_lang,
            "target_language": tgt_lang,
            "paragraphs": list(paragraphs),
        }
        return (
            "Translate the paragraphs listed in the JSON payload. "
            "Return a JSON array of translated paragraphs in the same order.\n\n"
            f"{json.dumps(payload, ensure_ascii=False)}"
        )

    @staticmethod
    def _extract_translations(response: Any) -> list[str]:
        raw_text = OpenAIProvider._collect_response_text(response)

        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise RuntimeError("OpenAI response was not valid JSON") from exc

        if isinstance(data, dict):
            if "translations" in data:
                data = data["translations"]
            elif "results" in data:
                data = data["results"]

        if not isinstance(data, list):
            raise RuntimeError("OpenAI response JSON does not contain a list of translations")

        return [str(item) for item in data]

    @staticmethod
    def _collect_response_text(response: Any) -> str:
        # Fast path for the Responses API convenience attribute.
        text = getattr(response, "output_text", None)
        if isinstance(text, list):
            text = "".join(str(item) for item in text)
        if isinstance(text, str) and text.strip():
            return text

        # Fallback for structured content arrays.
        output = getattr(response, "output", None)
        fragments: list[str] = []
        if output:
            for block in output:
                contents = getattr(block, "content", None)
                if not contents:
                    continue
                for item in contents:
                    if getattr(item, "type", None) in {"output_text", "text"}:
                        value = getattr(item, "text", None)
                        if isinstance(value, list):
                            fragments.extend(str(part) for part in value)
                        elif isinstance(value, str):
                            fragments.append(value)
                    elif hasattr(item, "content"):
                        value = getattr(item, "content")
                        if isinstance(value, list):
                            fragments.extend(str(part) for part in value)
                        elif isinstance(value, str):
                            fragments.append(value)
        if fragments:
            return "".join(fragments)

        # Legacy chat/completions style.
        choices = getattr(response, "choices", None)
        if choices:
            fragments = []
            for choice in choices:
                message = getattr(choice, "message", None)
                if message and hasattr(message, "content"):
                    fragments.append(str(message.content))
                elif hasattr(choice, "text"):
                    fragments.append(str(choice.text))
            if fragments:
                return "".join(fragments)

        raise RuntimeError("Unable to extract text from OpenAI response")
