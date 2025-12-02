"""Hugging Face Inference API-backed translation provider."""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Sequence
from typing import Any

from huggingface_hub import AsyncInferenceClient
from huggingface_hub.errors import InferenceTimeoutError

from .base import TranslationProvider

# Keep the prompt simple and strict to make JSON parsing reliable.
SYSTEM_PROMPT = (
    "You are a professional literary translator. "
    "Translate the paragraphs from the source language to the target language. "
    'Respond strictly with JSON: {"translations": ["..."]}.'
)

# Simple fence matcher for cases where the model wraps JSON in Markdown code fences.
_CODE_FENCE_RE = re.compile(r"```(?:json)?(.*?)```", re.DOTALL)


class HFInferenceProvider(TranslationProvider):
    """Translate paragraphs using the Hugging Face Inference API."""

    def __init__(
        self,
        *,
        model_id: str,
        api_token: str | None = None,
        base_url: str | None = None,
        max_new_tokens: int = 1024,
        temperature: float = 0.2,
        repetition_penalty: float = 1.05,
    ) -> None:
        # base_url lets you point to a local TGI server; omit for hosted Inference API.
        self._client = AsyncInferenceClient(model=model_id, token=api_token, base_url=base_url)
        self.max_new_tokens = max_new_tokens
        self.temperature = temperature
        self.repetition_penalty = repetition_penalty

    async def translate_batch(
        self,
        texts: Iterable[str],
        *,
        src_lang: str,
        tgt_lang: str,
    ) -> Sequence[str]:
        """Translate a batch of paragraphs, preserving order."""
        paragraphs = list(texts)
        if not paragraphs:
            return []

        payload = {
            "source_language": src_lang,
            "target_language": tgt_lang,
            "paragraphs": paragraphs,
        }
        prompt = (
            f"{SYSTEM_PROMPT}\n"
            "Translate the paragraphs in the JSON payload below.\n"
            'Return JSON exactly matching {"translations": ["..."]}.\n\n'
            f"{json.dumps(payload, ensure_ascii=False)}"
        )

        try:
            raw_response = await self._client.text_generation(
                prompt,
                max_new_tokens=self.max_new_tokens,
                temperature=self.temperature,
                repetition_penalty=self.repetition_penalty,
                stream=False,
            )
        except InferenceTimeoutError as exc:
            raise RuntimeError("Hugging Face inference timed out") from exc
        except Exception as exc:  # noqa: BLE001 - surface HF client failures clearly
            raise RuntimeError("Hugging Face inference failed") from exc

        translations = self._parse_translations(raw_response)
        if len(translations) != len(paragraphs):
            # Fail fast if the model drops or adds items; this is safer for downstream stages.
            raise RuntimeError(
                "Hugging Face returned a mismatched number of translations "
                f"(expected {len(paragraphs)}, received {len(translations)})"
            )

        return translations

    @staticmethod
    def _parse_translations(raw: Any) -> list[str]:
        """Best-effort parsing for JSON returned by text-generation models."""
        # The Inference API returns a string for text generation; ensure we handle that.
        if isinstance(raw, bytes):
            text = raw.decode("utf-8", errors="replace")
        else:
            text = str(raw)

        text = text.strip()

        # If the model wrapped JSON in markdown fences, peel them off.
        fenced_match = _CODE_FENCE_RE.search(text)
        if fenced_match:
            text = fenced_match.group(1).strip()

        # Attempt to load JSON directly; if it fails, try to extract the first JSON object/array.
        data: Any
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # Grab the first {...} or [...] block to salvage a valid JSON segment.
            json_fragment = HFInferenceProvider._extract_json_fragment(text)
            if not json_fragment:
                raise RuntimeError("Hugging Face response was not valid JSON")
            data = json.loads(json_fragment)

        if isinstance(data, dict):
            if "translations" in data:
                data = data["translations"]
            elif "results" in data:
                data = data["results"]

        if not isinstance(data, list):
            raise RuntimeError("Hugging Face response JSON does not contain a list of translations")

        return [str(item) for item in data]

    @staticmethod
    def _extract_json_fragment(text: str) -> str | None:
        """Extract the first JSON object/array from free-form text."""
        stack = []
        start_idx = None
        for idx, char in enumerate(text):
            if char in "{[":
                if not stack:
                    start_idx = idx
                stack.append(char)
            elif char in "}]":
                if stack:
                    stack.pop()
                    if not stack and start_idx is not None:
                        return text[start_idx : idx + 1]
        return None


__all__ = ("HFInferenceProvider",)
