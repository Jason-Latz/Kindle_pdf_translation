from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter
from starlette.responses import StreamingResponse

router = APIRouter()


async def event_stream(book_id: int) -> AsyncGenerator[bytes, None]:
    # Placeholder event stream. In a full implementation this would subscribe to DB or Redis updates.
    for pct in range(0, 101, 20):
        data = json.dumps({"book_id": book_id, "stage": "pending", "pct": pct})
        yield f"data: {data}\n\n".encode("utf-8")
        await asyncio.sleep(0.5)


@router.get("/{book_id}/events")
async def get_events(book_id: int) -> StreamingResponse:
    # In a production-ready service we would verify the book exists.
    return StreamingResponse(event_stream(book_id), media_type="text/event-stream")
