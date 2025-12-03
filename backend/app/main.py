"""FastAPI application factory for the Book Translator backend."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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

    # Serve the exported Next.js frontend when present. The Dockerfile copies
    # the static build into /app/frontend_static.
    static_dir = Path(__file__).resolve().parent.parent / "frontend_static"
    if static_dir.exists():
        app.mount(
            "/",
            StaticFiles(directory=static_dir, html=True),
            name="frontend",
        )

    return app


app = create_app()

__all__ = ("app", "create_app")
