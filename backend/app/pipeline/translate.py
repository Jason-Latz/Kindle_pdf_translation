"""Translation stage helpers."""

from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Awaitable, Callable, Iterable, Sequence

from ..providers import (
    DEFAULT_MAX_TOKENS,
    RESERVED_COMPLETION_TOKENS,
    chunk_by_tokens,
    get_translation_provider,
)
from ..storage.local import LocalStorage
from ..storage.s3_compat import S3Storage

ProgressCallback = Callable[[float], Awaitable[None]]


def _load_paragraphs_from_storage(
    storage: LocalStorage | S3Storage,
    location: str,
) -> list[str]:
    """Read the source paragraphs JSON from disk or remote storage."""
    if isinstance(storage, LocalStorage):
        path = Path(location)
        if not path.exists():
            raise FileNotFoundError(f"Paragraphs artifact '{location}' not found")
        payload = json.loads(path.read_text(encoding="utf-8"))
    else:
        handle = storage.open_artifact(location)
        data = handle.read()
        if hasattr(handle, "close"):
            handle.close()
        if isinstance(data, bytes):
            payload = json.loads(data.decode("utf-8"))
        else:
            payload = json.loads(data)

    paragraphs = payload.get("paragraphs")
    if not isinstance(paragraphs, list):
        raise ValueError("Paragraphs artifact does not contain a list of paragraphs")
    return [str(item) for item in paragraphs]


def _persist_translations(
    job_id: str,
    storage: LocalStorage | S3Storage,
    translations: Sequence[str],
    *,
    target_lang: str,
    filename: str = "translated_paragraphs.json",
) -> str:
    """Write translated paragraphs to artifacts storage."""
    payload = {
        "job_id": job_id,
        "target_language": target_lang,
        "paragraphs": list(translations),
    }
    encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")

    if isinstance(storage, LocalStorage):
        path = storage.artifact_path(job_id, filename)
        path.write_bytes(encoded)
        return str(path)

    key = f"artifacts/{job_id}/{filename}"
    storage.put_artifact(key, BytesIO(encoded))
    return key


async def translate_paragraphs(
    job_id: str,
    storage: LocalStorage | S3Storage,
    *,
    target_lang: str,
    source_lang: str = "auto",
    paragraphs: Iterable[str] | None = None,
    paragraphs_location: str | None = None,
    progress_callback: ProgressCallback | None = None,
    max_prompt_tokens: int = DEFAULT_MAX_TOKENS,
    reserved_prompt_tokens: int = RESERVED_COMPLETION_TOKENS,
) -> tuple[list[str], str]:
    """
    Translate the supplied paragraphs and persist the translated artifact.

    Returns the translated paragraphs and the artifact location.
    """
    if paragraphs is None and not paragraphs_location:
        raise ValueError("Either `paragraphs` or `paragraphs_location` must be provided")

    if paragraphs is not None:
        paragraph_list = list(paragraphs)
    else:
        assert paragraphs_location is not None  # noqa: S101 - validated above
        paragraph_list = _load_paragraphs_from_storage(storage, paragraphs_location)

    if not paragraph_list:
        location = _persist_translations(
            job_id,
            storage,
            [],
            target_lang=target_lang,
        )
        return [], location

    provider = get_translation_provider()
    batches = chunk_by_tokens(
        paragraph_list,
        max_tokens=max_prompt_tokens,
        reserved_tokens=reserved_prompt_tokens,
    )
    total_batches = max(1, len(batches))

    translations: list[str] = []

    if progress_callback is not None:
        await progress_callback(0.0)

    for index, batch in enumerate(batches, start=1):
        translated_batch = await provider.translate_batch(
            batch,
            src_lang=source_lang,
            tgt_lang=target_lang,
        )
        translations.extend(translated_batch)
        if progress_callback is not None:
            await progress_callback(index / total_batches)

    location = _persist_translations(
        job_id,
        storage,
        translations,
        target_lang=target_lang,
    )
    return translations, location


__all__ = ("translate_paragraphs",)
