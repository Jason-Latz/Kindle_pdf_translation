"""Local filesystem storage backend."""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO


class LocalStorage:
    """Persist uploads and artifacts on the local filesystem."""

    def __init__(self, base_dir: Path | str = Path("data")) -> None:
        # Store the root directory (default `data/`) where everything gets written.
        self.base_dir = Path(base_dir)
        # Ensure the base directory exists so later saves do not fail.
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save_upload(self, job_id: str, filename: str, data: BinaryIO) -> Path:
        """Persist an uploaded file under `data/uploads/{job_id}/`."""
        # Group everything for one translation job under its own uploads folder.
        job_dir = self.base_dir / "uploads" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        destination = job_dir / filename
        # Write all bytes from the incoming stream to disk.
        with destination.open("wb") as fh:
            fh.write(data.read())
        return destination

    def artifact_path(self, job_id: str, name: str) -> Path:
        """Return (and ensure) the artifact path under `data/artifacts/{job_id}/`."""
        # Artifacts (translated text, logs, etc.) live alongside uploads per job.
        job_dir = self.base_dir / "artifacts" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        return job_dir / name

    def open_artifact(self, path: Path, mode: str = "rb") -> BinaryIO:
        """Open an artifact path for reading."""
        # Defer to pathlib to open the file in the requested mode (defaults to read bytes).
        return path.open(mode)
