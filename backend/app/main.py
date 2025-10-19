"""Application entrypoint for the Kindle PDF Translator backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import api_router


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="Kindle PDF Translator API")

    # Allow the frontend to access the API while development stabilises.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    @app.get("/health")
    def healthcheck() -> dict[str, str]:
        """Simple readiness endpoint for local and container health checks."""
        return {"status": "ok"}

    return app


app = create_app()

__all__ = ("app", "create_app")
