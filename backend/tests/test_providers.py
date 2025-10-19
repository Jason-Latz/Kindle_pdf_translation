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
async def test_openai_provider_not_implemented_yet() -> None:
    provider = OpenAIProvider(api_key="test")
    with pytest.raises(NotImplementedError):
        await provider.translate_batch(["hola"], src_lang="es", tgt_lang="en")
