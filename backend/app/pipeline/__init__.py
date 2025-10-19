"""Background pipeline orchestration for translation jobs."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class PipelineContext:
    """Agglomerates per-job details used across pipeline stages."""

    job_id: str
    source_path: str
    target_lang: str


async def run_pipeline(context: PipelineContext) -> None:
    """Execute the extract → translate → build_epub → flashcards workflow."""
    raise NotImplementedError("Pipeline execution not implemented yet")


__all__ = ("PipelineContext", "run_pipeline")
