"""Central logging configuration."""

from __future__ import annotations

import logging
from pathlib import Path


def configure_logging(job_id: str) -> logging.Logger:
    """Set up a simple per-job file logger under `data/logs/`."""
    logs_dir = Path("data/logs")
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / f"{job_id}.log"

    logger = logging.getLogger(f"job:{job_id}")
    logger.setLevel(logging.INFO)

    if not any(isinstance(handler, logging.FileHandler) and handler.baseFilename == str(log_path) for handler in logger.handlers):
        file_handler = logging.FileHandler(log_path)
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


__all__ = ("configure_logging",)
