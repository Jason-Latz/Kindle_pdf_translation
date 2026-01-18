from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.pipeline import extract


def test_block_to_paragraphs_merges_and_splits() -> None:
    text = "Hello-\nworld\n\nNext line"

    paragraphs = extract._block_to_paragraphs(text)

    assert paragraphs == ["Helloworld", "Next line"]


def test_extract_sync_raises_for_missing_file(tmp_path) -> None:
    with pytest.raises(FileNotFoundError):
        extract._extract_sync(tmp_path / "missing.pdf")


def test_extract_sync_rejects_empty_pdf(monkeypatch, tmp_path) -> None:
    pdf_path = tmp_path / "empty.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    class _Doc:
        page_count = None
        pageCount = 0

        def close(self) -> None:
            self.closed = True

    doc = _Doc()

    monkeypatch.setattr(extract, "fitz", SimpleNamespace(open=lambda _path: doc))

    with pytest.raises(ValueError):
        extract._extract_sync(pdf_path)

    assert getattr(doc, "closed", False) is True


def test_extract_sync_filters_blocks(monkeypatch, tmp_path) -> None:
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    class _Page:
        def __init__(self, blocks):
            self._blocks = blocks
            self.rect = SimpleNamespace(height=100.0)

        def get_text(self, _mode):
            return self._blocks

    class _Doc:
        page_count = 1
        needs_pass = False

        def load_page(self, _index):
            return _Page(
                [
                    (0, 0, 0, 0),  # too short
                    (0, 0, 0, 0, "skip-type", 0, 1),  # non-text block
                    (0, 0, 0, 0, "", 0),  # empty text
                    (0, 0, 0, 0, "skip", 0),  # empty key
                    (0, 10, 0, 20, "Valid text", 0),  # valid
                ]
            )

        def close(self) -> None:
            return None

    def _normalize_key(value: str) -> str:
        if value == "skip":
            return ""
        return value

    monkeypatch.setattr(extract, "fitz", SimpleNamespace(open=lambda _path: _Doc()))
    monkeypatch.setattr(extract, "_normalize_key", _normalize_key)

    paragraphs = extract._extract_sync(pdf_path)

    assert paragraphs == ["Valid text"]


def test_extract_sync_raises_when_no_blocks(monkeypatch, tmp_path) -> None:
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    class _Page:
        rect = SimpleNamespace(height=100.0)

        def get_text(self, _mode):
            return []

    class _Doc:
        page_count = 1
        needs_pass = False

        def load_page(self, _index):
            return _Page()

        def close(self) -> None:
            return None

    monkeypatch.setattr(extract, "fitz", SimpleNamespace(open=lambda _path: _Doc()))

    with pytest.raises(ValueError):
        extract._extract_sync(pdf_path)


def test_extract_sync_filters_headers_and_raises_empty(monkeypatch, tmp_path) -> None:
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    class _Page:
        def __init__(self):
            self.rect = SimpleNamespace(height=100.0)

        def get_text(self, _mode):
            return [(0, 0, 0, 10, "Header", 0)]

    class _Doc:
        page_count = 2
        needs_pass = False

        def load_page(self, _index):
            return _Page()

        def close(self) -> None:
            return None

    monkeypatch.setattr(extract, "fitz", SimpleNamespace(open=lambda _path: _Doc()))

    with pytest.raises(ValueError):
        extract._extract_sync(pdf_path)
