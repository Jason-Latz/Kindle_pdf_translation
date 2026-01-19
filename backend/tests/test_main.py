from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_create_app_healthcheck(monkeypatch) -> None:
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "[\"https://example.test\"]")

    app = create_app()
    client = TestClient(app)

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
