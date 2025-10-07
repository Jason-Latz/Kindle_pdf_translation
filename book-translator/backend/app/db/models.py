from __future__ import annotations

import enum
from datetime import datetime
from sqlalchemy import JSON, Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class BookStatus(str, enum.Enum):
    PENDING = "PENDING"
    UPLOADED = "UPLOADED"
    PARSED = "PARSED"
    CHAPTERED = "CHAPTERED"
    EXTRACTED = "EXTRACTED"
    TRANSLATING = "TRANSLATING"
    ASSEMBLING = "ASSEMBLING"
    FLASHCARDS = "FLASHCARDS"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class JobStage(str, enum.Enum):
    PARSE_PDF = "parse_pdf"
    DETECT_CHAPTERS = "detect_chapters"
    EXTRACT_PARAGRAPHS = "extract_paragraphs"
    TRANSLATE = "translate"
    ASSEMBLE_EPUB = "assemble_epub"
    BUILD_FLASHCARDS = "build_flashcards"
    FINALIZE = "finalize"


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=True)
    src_lang = Column(String(8), nullable=False, default="en")
    tgt_lang = Column(String(8), nullable=False)
    status = Column(Enum(BookStatus), nullable=False, default=BookStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    error_message = Column(Text, nullable=True)

    chapters = relationship("Chapter", back_populates="book", cascade="all, delete-orphan")
    paragraphs = relationship("Paragraph", back_populates="book", cascade="all, delete-orphan")
    files = relationship("File", back_populates="book", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="book", cascade="all, delete-orphan")


class Chapter(Base):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    index = Column(Integer, nullable=False)
    title = Column(String(255), nullable=True)
    metadata = Column(JSON, nullable=True)

    book = relationship("Book", back_populates="chapters")
    paragraphs = relationship("Paragraph", back_populates="chapter")

    __table_args__ = (UniqueConstraint("book_id", "index", name="uq_chapter_book_index"),)


class Paragraph(Base):
    __tablename__ = "paragraphs"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    sha1 = Column(String(40), nullable=False)
    metadata = Column(JSON, nullable=True)

    book = relationship("Book", back_populates="paragraphs")
    chapter = relationship("Chapter", back_populates="paragraphs")
    translations = relationship("Translation", back_populates="paragraph", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("book_id", "index", name="uq_paragraph_book_index"),)


class Translation(Base):
    __tablename__ = "translations"

    id = Column(Integer, primary_key=True)
    paragraph_id = Column(Integer, ForeignKey("paragraphs.id", ondelete="CASCADE"), nullable=False)
    engine = Column(String(64), nullable=False)
    src_lang = Column(String(8), nullable=False)
    tgt_lang = Column(String(8), nullable=False)
    translated_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    paragraph = relationship("Paragraph", back_populates="translations")

    __table_args__ = (UniqueConstraint("paragraph_id", "engine", "tgt_lang", name="uq_translation_dedup"),)


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    file_type = Column(String(50), nullable=False)
    path = Column(String(512), nullable=False)
    mime_type = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    book = relationship("Book", back_populates="files")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    stage = Column(Enum(JobStage), nullable=False)
    progress = Column(Integer, nullable=False, default=0)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    completed = Column(Boolean, default=False, nullable=False)

    book = relationship("Book", back_populates="jobs")

    __table_args__ = (UniqueConstraint("book_id", "stage", name="uq_job_stage"),)
