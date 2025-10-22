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
        model: str = "gpt-5-nano",
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

        schema_payload = {
            "name": "translations_response",
            "schema": {
                "type": "object",
                "properties": {
                    "translations": {
                        "type": "array",
                        "items": {"type": "string"},
                    }
                },
                "required": ["translations"],
                "additionalProperties": False,
            },
        }

        translations: list[str] = []
        for batch in batches:
            request_kwargs = {
                "model": self.model,
                "input": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": self._build_user_prompt(batch, src_lang, tgt_lang),
                    },
                ],
                "max_output_tokens": self.max_output_tokens,
                "reasoning": {"effort": "low"},
            }
            try:
                response = await self._client.responses.create(
                    **request_kwargs,
                    response_format={
                        "type": "json_schema",
                        "json_schema": schema_payload,
                    },
                )
            except TypeError:
                response = await self._client.responses.create(**request_kwargs)
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
            "Respond strictly with JSON matching the schema {\"translations\": [\"...\"]}.\n\n"
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
        def _get(obj: Any, attr: str) -> Any:
            if hasattr(obj, attr):
                return getattr(obj, attr)
            if isinstance(obj, dict):
                return obj.get(attr)
            return None

        # Fast path for the Responses API convenience attribute.
        text = _get(response, "output_text")
        if isinstance(text, list):
            text = "".join(str(item) for item in text)
        if isinstance(text, str) and text.strip():
            return text

        # Fallback for structured content arrays.
        output = _get(response, "output")
        fragments: list[str] = []
        if output:
            for block in output:
                contents = _get(block, "content")
                if not contents:
                    continue
                for item in contents:
                    item_type = _get(item, "type")
                    if item_type in {"output_text", "text"}:
                        value = _get(item, "text")
                        if isinstance(value, list):
                            fragments.extend(str(part) for part in value)
                        elif isinstance(value, str):
                            fragments.append(value)
                    else:
                        value = _get(item, "content")
                        if isinstance(value, list):
                            fragments.extend(str(part) for part in value)
                        elif isinstance(value, str):
                            fragments.append(value)
        if fragments:
            return "".join(fragments)

        # Legacy chat/completions style.
        choices = _get(response, "choices")
        if choices:
            fragments = []
            for choice in choices:
                message = _get(choice, "message")
                if message:
                    content = _get(message, "content")
                    if isinstance(content, list):
                        fragments.extend(str(part) for part in content)
                    elif isinstance(content, str):
                        fragments.append(str(content))
                text_value = _get(choice, "text")
                if text_value:
                    fragments.append(str(text_value))
            if fragments:
                return "".join(fragments)

        raise RuntimeError("Unable to extract text from OpenAI response")
