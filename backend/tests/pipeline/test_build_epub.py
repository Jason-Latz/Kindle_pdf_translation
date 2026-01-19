from __future__ import annotations

from pathlib import Path

import pytest
from ebooklib import epub

from app.pipeline.build_epub import _create_book, _normalise_authors, build_epub


def test_normalise_authors_handles_variants() -> None:
    assert list(_normalise_authors(None)) == []
    assert list(_normalise_authors("Alice")) == ["Alice"]
    assert list(_normalise_authors(["Alice", 123, "Bob"])) == ["Alice", "Bob"]


def test_create_book_rejects_empty_paragraphs() -> None:
    with pytest.raises(ValueError):
        _create_book([], {"title": "Empty"})


def test_create_book_builds_epub_structure() -> None:
    paragraphs = ["Hello <world>", "Second paragraph."]
    metadata = {
        "title": "My Book",
        "language": "es",
        "identifier": "book-1",
        "authors": ["Alice", 7],
        "description": "Short description",
        "publisher": "TestPub",
        "stylesheet": "body { font-family: serif; }",
    }

    book = _create_book(paragraphs, metadata)

    assert isinstance(book, epub.EpubBook)
    assert any(item.file_name == "chapter1.xhtml" for item in book.get_items())
    assert any(item.file_name == "styles/stylesheet.css" for item in book.get_items())


@pytest.mark.asyncio
async def test_build_epub_writes_output(tmp_path, monkeypatch) -> None:
    output_path = tmp_path / "out" / "book.epub"
    called = {}

    def _write_epub(path: str, _book: epub.EpubBook) -> None:
        called["path"] = path
        Path(path).write_text("epub", encoding="utf-8")

    monkeypatch.setattr(epub, "write_epub", _write_epub)

    result = await build_epub(
        ["Paragraph one."],
        output_path,
        {"title": "Test", "language": "en", "identifier": "id-1"},
    )

    assert result == output_path.resolve()
    assert output_path.exists()
    assert called["path"] == str(output_path.resolve())
