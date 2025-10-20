"""EPUB assembly stage."""

from __future__ import annotations

import asyncio
import html
from collections.abc import Iterable, Sequence
from functools import partial
from pathlib import Path
from uuid import uuid4

from ebooklib import epub


def _normalise_authors(raw: object) -> Iterable[str]:
    """Yield string authors from metadata payload."""
    if raw is None:
        return []
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, Iterable):
        # Filter out non-string values just in case.
        return [value for value in raw if isinstance(value, str)]
    return []


def _create_book(paragraphs: Sequence[str], metadata: dict[str, str | object]) -> epub.EpubBook:
    """Build the in-memory EPUB structure."""
    if not paragraphs:
        raise ValueError("Cannot build an EPUB with no content")

    book = epub.EpubBook()

    title = str(metadata.get("title") or "Translated Book")
    language = str(metadata.get("language") or "en")
    identifier = str(metadata.get("identifier") or uuid4())

    book.set_identifier(identifier)
    book.set_title(title)
    book.set_language(language)

    for author in _normalise_authors(metadata.get("authors") or metadata.get("author")):
        book.add_author(author)

    description = metadata.get("description")
    if isinstance(description, str):
        book.add_metadata("DC", "description", description)

    # Persist any additional Dublin Core metadata entries provided by callers.
    reserved_keys = {"title", "language", "identifier", "authors", "author", "description"}
    for key, value in metadata.items():
        if key in reserved_keys or not isinstance(value, str):
            continue
        book.add_metadata("DC", key, value)

    chapter_title = str(metadata.get("chapter_title") or "Chapter 1")
    chapter = epub.EpubHtml(
        title=chapter_title,
        file_name="chapter1.xhtml",
        lang=language,
    )
    chapter_body = "".join(f"<p>{html.escape(paragraph)}</p>" for paragraph in paragraphs)
    chapter.content = f"<h1>{html.escape(chapter_title)}</h1>{chapter_body}"
    book.add_item(chapter)

    # Provide a minimal stylesheet so the output renders cleanly.
    style = metadata.get("stylesheet") or (
        "body { font-family: serif; } "
        "h1 { text-align: center; margin: 1em 0; } "
        "p { line-height: 1.5; margin: 0 0 1em; }"
    )
    if isinstance(style, str):
        style_item = epub.EpubItem(
            uid="style_default",
            file_name="styles/stylesheet.css",
            media_type="text/css",
            content=style.encode("utf-8"),
        )
        book.add_item(style_item)
    book.spine = ["nav", chapter]

    # Table of contents + navigation documents are required by most readers.
    book.toc = [epub.Link(chapter.file_name, chapter_title, "chapter-1")]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    return book


async def build_epub(paragraphs: Sequence[str], output_path: Path, metadata: dict[str, str]) -> Path:
    """Create an EPUB from translated paragraphs and return the saved path."""
    meta: dict[str, str | object] = dict(metadata)
    book = _create_book(paragraphs, meta)

    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, partial(epub.write_epub, str(output_path), book))
    return output_path


__all__ = ("build_epub",)
