from __future__ import annotations

from celery import Celery

from app.config import get_settings

settings = get_settings()

celery = Celery(
    "book_translator",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"])
