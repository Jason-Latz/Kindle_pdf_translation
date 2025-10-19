"""HTTP routes for upload, status polling, and artifact download."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["jobs"])


@router.post("/jobs", status_code=202)
async def create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tgt_lang: str = "es",
) -> dict[str, str]:
    """
    Accept a PDF upload and schedule the translation pipeline.

    The actual pipeline wiring will live in `pipeline/__init__.py` once implemented.
    """
    raise HTTPException(status_code=501, detail="Job creation not implemented yet")


@router.get("/jobs/{job_id}")
async def read_job(job_id: str) -> dict[str, str]:
    """Return the current status for a translation job."""
    raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")


@router.get("/jobs/{job_id}/download")
async def download_artifact(job_id: str, file_type: str = "epub") -> StreamingResponse:
    """Stream generated artifacts (`epub` or `flashcards`) once the pipeline finishes."""
    raise HTTPException(status_code=404, detail=f"Artifact '{file_type}' for job '{job_id}' not available")
