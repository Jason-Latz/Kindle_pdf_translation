"""PDF extraction stage."""

from __future__ import annotations

from pathlib import Path


async def extract_paragraphs(pdf_path: Path) -> list[str]:
    """Parse the PDF and return a list of normalized paragraphs."""
    raise NotImplementedError("PDF parsing not implemented yet")


__all__ = ("extract_paragraphs",)
