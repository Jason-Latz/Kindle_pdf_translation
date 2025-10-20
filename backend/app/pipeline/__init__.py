"""Background pipeline orchestration for translation jobs."""

from __future__ import annotations

import json
import shutil
import tempfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from ..config import Settings, get_settings
from ..db import get_session, manifest_path
from ..models import Job
from ..storage.local import LocalStorage
from ..storage.s3_compat import S3Config, S3Storage
from ..utils.logging import configure_logging
from .extract import extract_paragraphs
from .translate import translate_paragraphs


@dataclass(slots=True)
class PipelineContext:
    """Agglomerates per-job details used across pipeline stages."""

    job_id: str
    source_path: str
    target_lang: str


_SENTINEL = object()


async def _update_job_state(
    job_id: str,
    *,
    status: str | None = None,
    stage: str | None = None,
    pct: float | None = None,
    error: object = _SENTINEL,
    epub_path: object = _SENTINEL,
    cards_path: object = _SENTINEL,
    extra: dict[str, object] | None = None,
) -> None:
    """Persist stage/status updates on the configured backend."""
    settings = get_settings()

    if settings.db_mode == "sqlite":
        async with get_session() as session:
            job = await session.get(Job, job_id)
            if job is None:
                return

            if status is not None:
                job.status = status
            if stage is not None:
                job.stage = stage
            if pct is not None:
                job.pct = float(pct)
            if error is not _SENTINEL:
                job.error = error  # type: ignore[assignment]
            if epub_path is not _SENTINEL:
                job.epub_path = epub_path  # type: ignore[assignment]
            if cards_path is not _SENTINEL:
                job.cards_path = cards_path  # type: ignore[assignment]

            await session.commit()
        return

    if settings.db_mode == "manifests":
        path = manifest_path(job_id)
        if not path.exists():
            return
        payload = json.loads(path.read_text(encoding="utf-8"))
        if status is not None:
            payload["status"] = status
        if stage is not None:
            payload["stage"] = stage
        if pct is not None:
            payload["pct"] = float(pct)
        if error is not _SENTINEL:
            payload["error"] = error
        if epub_path is not _SENTINEL:
            payload["epub_path"] = epub_path
        if cards_path is not _SENTINEL:
            payload["cards_path"] = cards_path
        if extra:
            payload.update(extra)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return

    raise RuntimeError(f"Unsupported db mode '{settings.db_mode}'")


def _get_storage(settings: Settings) -> LocalStorage | S3Storage:
    """Instantiate the configured storage backend for pipeline work."""
    if settings.storage_backend == "local":
        return LocalStorage()

    if settings.storage_backend == "s3":
        if not all([settings.s3_access_key, settings.s3_secret_key]):
            raise RuntimeError("S3 credentials not configured")
        config = S3Config(
            endpoint=str(settings.s3_endpoint) if settings.s3_endpoint else None,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            bucket=settings.s3_bucket,
        )
        return S3Storage(config)

    raise RuntimeError(f"Unsupported storage backend '{settings.storage_backend}'")


def _resolve_source_pdf(
    storage: LocalStorage | S3Storage,
    source_ref: str,
    job_id: str,
) -> tuple[Path, Path | None]:
    """Return a local filesystem path for the source PDF (downloading when needed)."""
    if isinstance(storage, LocalStorage):
        path = Path(source_ref)
        if not path.exists():
            raise FileNotFoundError(f"Source PDF '{source_ref}' not found for job {job_id}")
        return path, None

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"job-{job_id}-"))
    pdf_path = tmp_dir / "source.pdf"
    response = storage.client.get_object(Bucket=storage.config.bucket, Key=source_ref)
    pdf_path.write_bytes(response["Body"].read())
    return pdf_path, tmp_dir


async def run_pipeline(context: PipelineContext) -> None:
    """Execute the extract → translate → build_epub → flashcards workflow."""
    settings = get_settings()
    storage = _get_storage(settings)
    logger = configure_logging(context.job_id)

    paragraphs_location: str | None = None
    tmp_dir: Path | None = None

    try:
        await _update_job_state(
            context.job_id,
            status="processing",
            stage="parse_pdf",
            pct=5.0,
            error=None,
        )

        source_path, tmp_dir = _resolve_source_pdf(
            storage,
            context.source_path,
            context.job_id,
        )
        paragraphs = await extract_paragraphs(source_path)
        await _update_job_state(
            context.job_id,
            status="processing",
            stage="parse_pdf",
            pct=20.0,
        )

        paragraph_bytes = json.dumps(
            {
                "job_id": context.job_id,
                "paragraphs": paragraphs,
            },
            ensure_ascii=False,
            indent=2,
        )
        if isinstance(storage, LocalStorage):
            paragraph_path = storage.artifact_path(context.job_id, "paragraphs.json")
            paragraph_path.write_text(paragraph_bytes, encoding="utf-8")
            paragraphs_location = str(paragraph_path)
        else:
            key = f"artifacts/{context.job_id}/paragraphs.json"
            storage.put_artifact(key, BytesIO(paragraph_bytes.encode("utf-8")))
            paragraphs_location = key

        extra_payload: dict[str, object] = {}
        if paragraphs_location and settings.db_mode == "manifests":
            extra_payload["paragraphs_path"] = paragraphs_location

        await _update_job_state(
            context.job_id,
            status="processing",
            stage="parse_pdf",
            pct=30.0,
            extra=extra_payload if extra_payload else None,
        )
        logger.info("Extracted %d paragraphs from PDF", len(paragraphs))

        await _update_job_state(
            context.job_id,
            status="processing",
            stage="translate",
            pct=40.0,
        )

        async def _translate_progress(progress: float) -> None:
            pct = 40.0 + (progress * 35.0)
            await _update_job_state(
                context.job_id,
                status="processing",
                stage="translate",
                pct=pct,
            )

        translations, translations_location = await translate_paragraphs(
            context.job_id,
            storage,
            target_lang=context.target_lang,
            paragraphs=paragraphs,
            paragraphs_location=paragraphs_location,
            progress_callback=_translate_progress,
        )

        if settings.db_mode == "manifests" and translations_location:
            extra_payload["translations_path"] = translations_location

        await _update_job_state(
            context.job_id,
            status="processing",
            stage="translate",
            pct=75.0,
            extra=extra_payload if extra_payload else None,
        )
        logger.info(
            "Translated %d paragraphs to %s",
            len(translations),
            context.target_lang,
        )

        artifact_name = "book.epub"
        if isinstance(storage, LocalStorage):
            artifact_path = storage.artifact_path(context.job_id, artifact_name)
            artifact_path.write_bytes(b"stub")
            artifact_location = str(artifact_path)
        else:  # S3Storage
            key = f"artifacts/{context.job_id}/{artifact_name}"
            storage.put_artifact(key, BytesIO(b"stub"))
            artifact_location = key

        final_extra: dict[str, object] | None = None
        if settings.db_mode == "manifests":
            final_extra = dict(extra_payload)
            if paragraphs_location and "paragraphs_path" not in final_extra:
                final_extra["paragraphs_path"] = paragraphs_location
            if translations_location and "translations_path" not in final_extra:
                final_extra["translations_path"] = translations_location

        await _update_job_state(
            context.job_id,
            status="done",
            stage="finalize",
            pct=100.0,
            error=None,
            epub_path=artifact_location,
            extra=final_extra if final_extra else None,
        )
    except Exception as exc:  # pragma: no cover - defensive logging path
        logger.exception("Pipeline failed for job %s", context.job_id)
        await _update_job_state(
            context.job_id,
            status="error",
            stage="parse_pdf",
            error=str(exc),
        )
    finally:
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    if settings.db_mode not in {"sqlite", "manifests"}:
        raise RuntimeError(f"Unsupported db mode '{settings.db_mode}'")


__all__ = ("PipelineContext", "run_pipeline")
