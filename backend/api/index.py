"""Vercel entrypoint exposing the FastAPI app."""

from app.main import app

__all__ = ("app",)
