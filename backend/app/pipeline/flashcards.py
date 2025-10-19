"""Flashcard generation stage."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence


async def generate_flashcards(paragraphs: Sequence[str], output_path: Path) -> Path:
    """Create a vocabulary CSV for the translated content."""
    raise NotImplementedError("Flashcard generation not implemented yet")


__all__ = ("generate_flashcards",)
