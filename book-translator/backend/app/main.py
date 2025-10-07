from __future__ import annotations

from fastapi import FastAPI

from app.config import get_settings
from app.routers import books, events

settings = get_settings()

app = FastAPI(title="Book Translator", version="0.1.0")

app.include_router(books.router, prefix="/api/books", tags=["books"])
app.include_router(events.router, prefix="/api/books", tags=["events"])


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "environment": settings.app_env}
