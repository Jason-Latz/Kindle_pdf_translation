"""Advisory lock helpers for serializing work."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator


@contextmanager
def job_lock(_: str) -> Iterator[None]:
    """Placeholder lock that simply yields control (swap for real locking later)."""
    yield


__all__ = ("job_lock",)
