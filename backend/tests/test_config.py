from __future__ import annotations

from app.config import get_settings


def test_settings_default_values(monkeypatch) -> None:
    monkeypatch.delenv("DB_MODE", raising=False)
    settings = get_settings()
    assert settings.translator_provider == "openai"
    assert settings.storage_backend == "local"
    assert settings.db_mode == "sqlite"
    assert settings.max_pdf_mb == 100
    assert settings.max_pages == 600
    assert settings.target_langs == ["es", "fr", "de", "it", "pt"]


def test_settings_parses_comma_separated_lists(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_LANGS", "es, fr ,  de")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://a.test,https://b.test")
    monkeypatch.delenv("DB_MODE", raising=False)

    settings = get_settings()

    assert settings.target_langs == ["es", "fr", "de"]
    assert settings.cors_allow_origins == ["https://a.test", "https://b.test"]
