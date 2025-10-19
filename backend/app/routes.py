"""HTTP routes for upload, status polling, and artifact download."""

from __future__ import annotations

import json
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .config import Settings, get_settings
from .db import ensure_schema, get_session, manifest_path
from .models import Job
from .storage.local import LocalStorage
from .storage.s3_compat import S3Config, S3Storage

router = APIRouter(tags=["jobs"])


class JobStatusResponse(BaseModel):
    """API response schema for job status information."""

    job_id: str
    status: str
    stage: str
    pct: float


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


def _normalize_lang(value: str) -> str:
    """Lowercase and trim user/config language codes."""
    return value.lower().strip().strip("[]").strip('"').strip("'")


@router.post("/jobs", status_code=202)
async def create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tgt_lang: str = Form("es"),
) -> JobStatusResponse:
    """
    Accept a PDF upload and schedule the translation pipeline.

    The actual pipeline wiring will live in `pipeline/__init__.py` once implemented.
    """
    settings = get_settings()
    storage = _get_storage(settings)

    allowed_langs = {_normalize_lang(lang) for lang in settings.target_langs if lang}
    normalized_lang = _normalize_lang(tgt_lang)
    if normalized_lang not in allowed_langs:
        raise HTTPException(
            status_code=400,
            detail=f"Target language '{tgt_lang}' is not supported",
        )

    job_id = uuid4().hex
    filename = file.filename or "upload.pdf"

    try:
        file.file.seek(0)
        source_location = storage.save_upload(job_id, filename, file.file)
    except Exception as exc:  # pragma: no cover - defensive logging path
        raise HTTPException(
            status_code=500,
            detail="Unable to persist uploaded file",
        ) from exc

    job = await _persist_initial_job(
        settings=settings,
        job_id=job_id,
        filename=filename,
        tgt_lang=normalized_lang,
        source_location=str(source_location),
    )

    return job


@router.get("/jobs/{job_id}")
async def read_job(job_id: str) -> dict[str, str]:
    """Return the current status for a translation job."""
    raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")


@router.get("/jobs/{job_id}/download")
async def download_artifact(job_id: str, file_type: str = "epub") -> StreamingResponse:
    """Stream generated artifacts (`epub` or `flashcards`) once the pipeline finishes."""
    raise HTTPException(status_code=404, detail=f"Artifact '{file_type}' for job '{job_id}' not available")


async def _persist_initial_job(
    *,
    settings: Settings,
    job_id: str,
    filename: str,
    tgt_lang: str,
    source_location: str,
) -> JobStatusResponse:
    """Record the initial job state using the configured persistence backend."""
    if settings.db_mode == "sqlite":
        await ensure_schema()
        async with get_session() as session:
            job = Job(
                id=job_id,
                filename=filename,
                tgt_lang=tgt_lang,
                status="queued",
                pct=0.0,
                stage="queued",
            )
            session.add(job)
            await session.commit()
        return JobStatusResponse(
            job_id=job_id,
            status="queued",
            pct=0.0,
            stage="queued",
        )

    if settings.db_mode == "manifests":
        payload = {
            "id": job_id,
            "filename": filename,
            "tgt_lang": tgt_lang,
            "status": "queued",
            "pct": 0.0,
            "stage": "queued",
            "source": source_location,
        }
        path = manifest_path(job_id)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return JobStatusResponse(
            job_id=job_id,
            status="queued",
            pct=0.0,
            stage="queued",
        )

    raise HTTPException(
        status_code=500,
        detail=f"Unsupported db mode '{settings.db_mode}'",
    )
