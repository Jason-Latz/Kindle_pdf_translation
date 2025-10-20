"""PDF extraction stage."""

from __future__ import annotations

import asyncio
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import fitz  # type: ignore[import-untyped]

from ..config import get_settings

HEADER_RATIO = 0.12
FOOTER_RATIO = 0.12
MIN_REPEAT_RATIO = 0.6
MIN_REPEAT_COUNT = 2
_WHITESPACE_RE = re.compile(r"\s+")


@dataclass(slots=True)
class TextBlock:
    """Parsed text block with minimal layout metadata."""

    page_index: int
    text: str
    key: str
    y0: float
    y1: float


def _normalize_key(text: str) -> str:
    """Collapse whitespace for header/footer comparisons."""
    return _WHITESPACE_RE.sub(" ", text).strip()


def _block_to_paragraphs(text: str) -> list[str]:
    """Normalize a text block into one or more dehyphenated paragraphs."""
    paragraphs: list[str] = []
    current = ""

    for raw_line in text.splitlines():
        normalized = _WHITESPACE_RE.sub(" ", raw_line.strip())

        if not normalized:
            if current:
                paragraphs.append(current.strip())
                current = ""
            continue

        if current:
            if current.endswith("-") and normalized and normalized[0].islower():
                current = current[:-1] + normalized
            else:
                current = f"{current} {normalized}"
        else:
            current = normalized

    if current:
        paragraphs.append(current.strip())

    # Filter out any blanks that slipped through after trimming.
    return [paragraph for paragraph in paragraphs if paragraph]


def _extract_sync(pdf_path: Path) -> list[str]:
    """Synchronous PDF parsing helper executed off the event loop."""
    settings = get_settings()

    if not pdf_path.exists() or not pdf_path.is_file():
        raise FileNotFoundError(f"PDF not found at '{pdf_path}'")

    max_bytes = settings.max_pdf_mb * 1024 * 1024
    size_bytes = pdf_path.stat().st_size
    if size_bytes > max_bytes:
        raise ValueError(
            f"PDF size {size_bytes / (1024 * 1024):.1f} MB exceeds {settings.max_pdf_mb} MB limit"
        )

    try:
        document = fitz.open(pdf_path)
    except Exception as exc:  # pragma: no cover - defensive guard
        message = str(exc).lower()
        if "password" in message or "encrypt" in message:
            raise ValueError("Encrypted PDFs are not supported") from exc
        raise ValueError("Unable to open PDF for parsing") from exc

    try:
        if getattr(document, "needs_pass", False):
            raise ValueError("Encrypted PDFs are not supported")

        page_count = getattr(document, "page_count", None)
        if page_count is None:
            page_count = getattr(document, "pageCount", 0)
        page_count = int(page_count)
        if page_count == 0:
            raise ValueError("PDF contains no pages")
        if page_count > settings.max_pages:
            raise ValueError(
                f"PDF has {page_count} pages which exceeds {settings.max_pages}"
            )

        header_counter: Counter[str] = Counter()
        footer_counter: Counter[str] = Counter()
        blocks: list[TextBlock] = []

        for page_index in range(page_count):
            page = document.load_page(page_index)
            page_height = float(page.rect.height or 0.0)
            header_cutoff = page_height * HEADER_RATIO
            footer_cutoff = page_height * (1.0 - FOOTER_RATIO)
            page_header_keys: set[str] = set()
            page_footer_keys: set[str] = set()

            for block in page.get_text("blocks"):
                if len(block) < 5:
                    continue

                block_type = block[6] if len(block) >= 7 else 0
                if block_type not in (0, None):
                    continue

                raw_text = str(block[4]).strip()
                if not raw_text:
                    continue

                key = _normalize_key(raw_text)
                if not key:
                    continue

                y0 = float(block[1])
                y1 = float(block[3])

                blocks.append(
                    TextBlock(
                        page_index=page_index,
                        text=raw_text,
                        key=key,
                        y0=y0,
                        y1=y1,
                    )
                )

                if page_height:
                    if y0 <= header_cutoff:
                        page_header_keys.add(key)
                    if y1 >= footer_cutoff:
                        page_footer_keys.add(key)

            for key in page_header_keys:
                header_counter[key] += 1
            for key in page_footer_keys:
                footer_counter[key] += 1

        if not blocks:
            raise ValueError("The PDF does not contain extractable text content")

        if page_count >= MIN_REPEAT_COUNT:
            repeat_threshold = max(MIN_REPEAT_COUNT, int(page_count * MIN_REPEAT_RATIO))
            header_keys = {
                key for key, count in header_counter.items() if count >= repeat_threshold
            }
            footer_keys = {
                key for key, count in footer_counter.items() if count >= repeat_threshold
            }
        else:
            header_keys = set()
            footer_keys = set()

        paragraphs: list[str] = []
        for block in blocks:
            if block.key in header_keys or block.key in footer_keys:
                continue
            paragraphs.extend(_block_to_paragraphs(block.text))

        if not paragraphs:
            raise ValueError("The PDF appears to be image-only or empty")

        return paragraphs
    finally:
        document.close()


async def extract_paragraphs(pdf_path: Path) -> list[str]:
    """Parse the PDF and return a list of normalized paragraphs."""
    resolved_path = Path(pdf_path)
    return await asyncio.to_thread(_extract_sync, resolved_path)


__all__ = ("extract_paragraphs",)
