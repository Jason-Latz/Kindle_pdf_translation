from __future__ import annotations

import asyncio
import logging

import pytest

from app.utils.telemetry import PipelineTelemetry, track_stage


@pytest.mark.asyncio
async def test_track_stage_records_timing(caplog: pytest.LogCaptureFixture) -> None:
    logger = logging.getLogger("telemetry-test")
    telemetry = PipelineTelemetry(job_id="job-1", logger=logger)

    caplog.set_level(logging.INFO)

    async with track_stage(telemetry, "extract", details={"pages": 2}):
        await asyncio.sleep(0)

    summary = telemetry.summary_ms()
    assert "extract" in summary
    assert summary["extract"] >= 0.0
    assert "Telemetry stage 'extract' completed" in caplog.text
