from __future__ import annotations

import textwrap
from pathlib import Path

import fitz  # type: ignore[import-untyped]
import pytest

from app.pipeline.extract import extract_paragraphs


def _write_pdf(
    path: Path,
    *,
    pages_text: list[str],
    header: str | None = None,
    footer: str | None = None,
    encrypt: bool = False,
) -> None:
    """Create a simple PDF at `path` with optional repeated header/footer."""
    doc = fitz.open()
    for text in pages_text:
        page = doc.new_page()
        if header:
            page.insert_text((72, 40), header, fontsize=12)
        if footer:
            page.insert_text(
                (72, page.rect.height - 40),
                footer,
                fontsize=12,
            )
        page.insert_textbox(
            fitz.Rect(72, 120, page.rect.width - 72, page.rect.height - 72),
            textwrap.dedent(text),
            fontsize=12,
        )

    save_kwargs: dict[str, object] = {}
    if encrypt:
        save_kwargs.update(
            {
                "encryption": fitz.PDF_ENCRYPT_AES_256,
                "owner_pw": "owner",
                "user_pw": "user",
                "permissions": 0,
            }
        )

    doc.save(path, **save_kwargs)
    doc.close()


@pytest.mark.asyncio
async def test_extract_paragraphs_basic_cleanup(tmp_path: Path) -> None:
    pdf_path = tmp_path / "basic.pdf"
    _write_pdf(
        pdf_path,
        pages_text=[
            "This is de-\nhyphenated text across lines.\nContinuing the paragraph.\n\nSecond paragraph on page one.",
            "Final page paragraph with no header residue.",
        ],
        header="Repeated Chapter Header",
        footer="Page footer 1",
    )

    paragraphs = await extract_paragraphs(pdf_path)

    assert any("dehyphenated text across lines" in paragraph for paragraph in paragraphs)
    assert any(
        paragraph.startswith("Final page paragraph") for paragraph in paragraphs
    )
    combined = " ".join(paragraphs)
    assert "Repeated Chapter Header" not in combined
    assert "Page footer 1" not in combined


@pytest.mark.asyncio
async def test_extract_paragraphs_enforces_size_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MAX_PDF_MB", "0")
    pdf_path = tmp_path / "size-limit.pdf"
    _write_pdf(pdf_path, pages_text=["Tiny body"])

    with pytest.raises(ValueError, match="exceeds"):
        await extract_paragraphs(pdf_path)


@pytest.mark.asyncio
async def test_extract_paragraphs_enforces_page_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MAX_PAGES", "1")
    pdf_path = tmp_path / "page-limit.pdf"
    _write_pdf(pdf_path, pages_text=["Page one", "Page two"])

    with pytest.raises(ValueError, match="exceeds"):
        await extract_paragraphs(pdf_path)


@pytest.mark.asyncio
async def test_extract_paragraphs_rejects_encrypted_pdf(tmp_path: Path) -> None:
    pdf_path = tmp_path / "encrypted.pdf"
    _write_pdf(pdf_path, pages_text=["Secret paragraphs"], encrypt=True)

    with pytest.raises(ValueError, match="Encrypted"):
        await extract_paragraphs(pdf_path)
