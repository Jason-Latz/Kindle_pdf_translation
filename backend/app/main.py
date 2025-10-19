"""FastAPI application factory for the Book Translator backend."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routes import router as api_router


def create_app() -> FastAPI:
    """Instantiate and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Book Translator API",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    @app.get("/healthz", tags=["system"])
    def healthcheck() -> dict[str, str]:
        """Simple readiness endpoint for local and container health checks."""
        return {"status": "ok"}

    return app


app = create_app()

__all__ = ("app", "create_app")
