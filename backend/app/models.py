"""SQLAlchemy models used when the app runs in sqlite mode."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Job(Base):
    """Translation job metadata persisted in SQLite."""

    __tablename__ = "jobs"

    id = Column(String(32), primary_key=True, index=True)
    filename = Column(String(512), nullable=False)
    tgt_lang = Column(String(8), nullable=False)
    status = Column(String(32), nullable=False, default="queued")
    pct = Column(Float, nullable=False, default=0.0)
    stage = Column(String(32), nullable=False, default="queued")
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    epub_path = Column(String(1024), nullable=True)
    cards_path = Column(String(1024), nullable=True)


__all__ = ("Base", "Job")
