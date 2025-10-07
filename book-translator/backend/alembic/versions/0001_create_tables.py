"""create initial tables"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "books",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("src_lang", sa.String(length=8), nullable=False),
        sa.Column("tgt_lang", sa.String(length=8), nullable=False),
        sa.Column("status", sa.Enum("PENDING", "UPLOADED", "PARSED", "CHAPTERED", "EXTRACTED", "TRANSLATING", "ASSEMBLING", "FLASHCARDS", "COMPLETE", "FAILED", name="bookstatus"), nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("error_message", sa.Text(), nullable=True),
    )

    op.create_table(
        "chapters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.UniqueConstraint("book_id", "index", name="uq_chapter_book_index"),
    )

    op.create_table(
        "paragraphs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chapter_id", sa.Integer(), sa.ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True),
        sa.Column("index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("sha1", sa.String(length=40), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.UniqueConstraint("book_id", "index", name="uq_paragraph_book_index"),
    )

    op.create_table(
        "translations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("paragraph_id", sa.Integer(), sa.ForeignKey("paragraphs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("engine", sa.String(length=64), nullable=False),
        sa.Column("src_lang", sa.String(length=8), nullable=False),
        sa.Column("tgt_lang", sa.String(length=8), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("paragraph_id", "engine", "tgt_lang", name="uq_translation_dedup"),
    )

    op.create_table(
        "files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_type", sa.String(length=50), nullable=False),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage", sa.Enum("parse_pdf", "detect_chapters", "extract_paragraphs", "translate", "assemble_epub", "build_flashcards", "finalize", name="jobstage"), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint("book_id", "stage", name="uq_job_stage"),
    )


def downgrade() -> None:
    op.drop_table("jobs")
    op.drop_table("files")
    op.drop_table("translations")
    op.drop_table("paragraphs")
    op.drop_table("chapters")
    op.drop_table("books")
