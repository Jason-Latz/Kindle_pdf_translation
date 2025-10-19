"""S3-compatible storage helpers (MinIO or AWS S3)."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import BinaryIO

import boto3


@dataclass(slots=True)
class S3Config:
    """Configuration required to talk to an S3-compatible service."""

    endpoint: str | None
    access_key: str
    secret_key: str
    bucket: str
    region: str | None = None


class S3Storage:
    """Thin wrapper around boto3 for the methods the app needs."""

    def __init__(self, config: S3Config):
        self.config = config
        self.client = boto3.client(
            "s3",
            endpoint_url=config.endpoint,
            aws_access_key_id=config.access_key,
            aws_secret_access_key=config.secret_key,
            region_name=config.region,
        )

    def save_upload(self, job_id: str, filename: str, data: BinaryIO) -> str:
        """Write an uploaded file to the configured bucket."""
        key = f"uploads/{job_id}/{filename}"
        self.client.put_object(Bucket=self.config.bucket, Key=key, Body=data.read())
        return key

    def put_artifact(self, key: str, data: BinaryIO) -> str:
        """Persist an artifact."""
        self.client.put_object(Bucket=self.config.bucket, Key=key, Body=data.read())
        return key

    def open_artifact(self, key: str) -> BinaryIO:
        """Fetch an artifact as a binary stream."""
        response = self.client.get_object(Bucket=self.config.bucket, Key=key)
        return BytesIO(response["Body"].read())


__all__ = ("S3Config", "S3Storage")
