from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import models
from app.db.session import get_db
from app.services import storage
from app.workers.tasks import run_pipeline

router = APIRouter()
settings = get_settings()


class CreateBookRequest(BaseModel):
    filename: str
    content_type: str = Field(default="application/pdf")
    content_length: int = Field(gt=0)
    target_language: str


class CreateBookResponse(BaseModel):
    book_id: int
    upload_url: str


class BookResponse(BaseModel):
    id: int
    status: models.BookStatus
    tgt_lang: str
    files: list[dict[str, str]]


@router.post("", response_model=CreateBookResponse, status_code=status.HTTP_201_CREATED)
def create_book(payload: CreateBookRequest, db: Session = Depends(get_db)) -> CreateBookResponse:
    if payload.target_language not in settings.supported_tgt_langs:
        raise HTTPException(status_code=400, detail="Unsupported target language")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if payload.content_length > max_bytes:
        raise HTTPException(status_code=400, detail="File too large")

    book = models.Book(
        title=payload.filename,
        src_lang=settings.default_src_lang,
        tgt_lang=payload.target_language,
        status=models.BookStatus.PENDING,
    )
    db.add(book)
    db.commit()
    db.refresh(book)

    key = f"uploads/{book.id}/{payload.filename}"
    upload_url = storage.generate_signed_put_url(key, payload.content_type)

    file_record = models.File(
        book_id=book.id,
        file_type="original_pdf",
        path=key,
        mime_type=payload.content_type,
    )
    db.add(file_record)
    db.commit()

    return CreateBookResponse(book_id=book.id, upload_url=upload_url)


class UploadCompleteRequest(BaseModel):
    filename: Optional[str] = None


@router.post("/{book_id}/upload-complete", status_code=status.HTTP_202_ACCEPTED)
def upload_complete(book_id: int, payload: UploadCompleteRequest | None = None, db: Session = Depends(get_db)) -> dict[str, str]:
    book = db.get(models.Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    book.status = models.BookStatus.UPLOADED
    book.updated_at = datetime.utcnow()
    db.add(book)
    db.commit()

    run_pipeline.delay(book.id)

    return {"status": book.status}


@router.get("/{book_id}", response_model=BookResponse)
def get_book(book_id: int, db: Session = Depends(get_db)) -> BookResponse:
    book = db.get(models.Book, book_id)
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    files: list[dict[str, str]] = []
    for file in book.files:
        files.append({
            "type": file.file_type,
            "url": storage.generate_presigned_get_url(file.path),
        })

    return BookResponse(id=book.id, status=book.status, tgt_lang=book.tgt_lang, files=files)
