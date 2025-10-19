"""HTTP routes for upload, status polling, and artifact download."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .config import Settings, get_settings
from .storage.local import LocalStorage
from .storage.s3_compat import S3Config, S3Storage

router = APIRouter(tags=["jobs"])


def _get_storage(settings: Settings):
    """Instantiate the configured storage backend for the current request."""
    if settings.storage_backend == "local":
        return LocalStorage()

    if settings.storage_backend == "s3":
        if not all([settings.s3_access_key, settings.s3_secret_key]):
            raise HTTPException(
                status_code=500,
                detail="S3 storage selected but credentials are not configured",
            )

        config = S3Config(
            endpoint=str(settings.s3_endpoint) if settings.s3_endpoint else None,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            bucket=settings.s3_bucket,
        )
        return S3Storage(config)

    raise HTTPException(
        status_code=500,
        detail=f"Unsupported storage backend '{settings.storage_backend}'",
    )


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
    settings = get_settings()
    storage = _get_storage(settings)

    raise HTTPException(
        status_code=501,
        detail=(
            "Job creation not implemented yet "
            f"(storage backend: {settings.storage_backend})"
        ),
    )


@router.get("/jobs/{job_id}")
async def read_job(job_id: str) -> dict[str, str]:
    """Return the current status for a translation job."""
    raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")


@router.get("/jobs/{job_id}/download")
async def download_artifact(job_id: str, file_type: str = "epub") -> StreamingResponse:
    """Stream generated artifacts (`epub` or `flashcards`) once the pipeline finishes."""
    raise HTTPException(status_code=404, detail=f"Artifact '{file_type}' for job '{job_id}' not available")
