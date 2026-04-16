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


def test_settings_support_postgres_db_mode(monkeypatch) -> None:
    monkeypatch.setenv("DB_MODE", "postgres")
    monkeypatch.setenv(
        "DB_URL",
        "postgresql+asyncpg://postgres:password@example.com:5432/postgres",
    )

    settings = get_settings()

    assert settings.db_mode == "postgres"
    assert settings.db_url == (
        "postgresql+asyncpg://postgres:password@example.com:5432/postgres"
    )
