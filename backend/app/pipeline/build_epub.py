"""EPUB assembly stage."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence


async def build_epub(paragraphs: Sequence[str], output_path: Path, metadata: dict[str, str]) -> Path:
    """Create an EPUB from translated paragraphs and return the saved path."""
    raise NotImplementedError("EPUB generation not implemented yet")


__all__ = ("build_epub",)
