"""Helpers for generating unique identifiers."""

from __future__ import annotations

import secrets


def new_job_id() -> str:
    """Return a 16-byte hex-encoded identifier suitable for job IDs."""
    return secrets.token_hex(8)


__all__ = ("new_job_id",)
