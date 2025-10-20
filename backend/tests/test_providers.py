from __future__ import annotations

import pytest

from app.providers.hf_stub_provider import HFStubProvider
from app.providers.openai_provider import OpenAIProvider


@pytest.mark.asyncio
async def test_hf_stub_provider_prefixes_translations() -> None:
    provider = HFStubProvider()
    result = await provider.translate_batch(["hola", "mundo"], src_lang="es", tgt_lang="en")
    assert result == ["[en] hola", "[en] mundo"]


@pytest.mark.asyncio
async def test_openai_provider_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRANSLATOR_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "")

    from app.providers.base import get_translation_provider

    with pytest.raises(RuntimeError):
        get_translation_provider()
