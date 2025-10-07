from __future__ import annotations

from celery import shared_task


@shared_task(name="pipeline.placeholder")
def run_pipeline(book_id: int) -> dict[str, str]:
    # Placeholder task until full pipeline is implemented.
    return {"status": "queued", "book_id": book_id}
