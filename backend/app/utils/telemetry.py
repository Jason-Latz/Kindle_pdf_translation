"""Instrumentation helpers for pipeline timing and telemetry."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import logging
from time import perf_counter


@dataclass(slots=True)
class StageTiming:
    """Represents a timed pipeline stage."""

    name: str
    start: float
    end: float
    duration_ms: float
    details: dict[str, object] | None = None


@dataclass(slots=True)
class PipelineTelemetry:
    """Collects timing data for a job's pipeline stages."""

    job_id: str
    logger: logging.Logger
    stages: list[StageTiming] = field(default_factory=list)

    def record(self, name: str, start: float, end: float, details: dict[str, object] | None = None) -> None:
        """Store a stage timing and emit a log entry."""
        duration_ms = (end - start) * 1000.0
        self.stages.append(
            StageTiming(
                name=name,
                start=start,
                end=end,
                duration_ms=duration_ms,
                details=details,
            )
        )
        detail_suffix = f" | details={details}" if details else ""
        self.logger.info(
            "Telemetry stage '%s' completed in %.2f ms%s",
            name,
            duration_ms,
            detail_suffix,
        )

    def summary_ms(self) -> dict[str, float]:
        """Return stage durations keyed by stage name."""
        return {stage.name: stage.duration_ms for stage in self.stages}


@asynccontextmanager
async def track_stage(
    telemetry: PipelineTelemetry,
    name: str,
    *,
    details: dict[str, object] | None = None,
) -> AsyncIterator[None]:
    """Async context manager to capture stage duration."""
    start = perf_counter()
    try:
        yield
    finally:
        end = perf_counter()
        telemetry.record(name, start, end, details)


__all__ = ("PipelineTelemetry", "StageTiming", "track_stage")
