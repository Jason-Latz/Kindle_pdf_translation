from __future__ import annotations

from typing import Optional

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import get_settings

settings = get_settings()

_session = boto3.session.Session(
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
)

_s3 = _session.client(
    "s3",
    endpoint_url=settings.s3_endpoint_url,
    config=Config(signature_version="s3v4"),
)


def create_bucket_if_missing() -> None:
    try:
        _s3.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        _s3.create_bucket(Bucket=settings.s3_bucket)


def put_object(key: str, data: bytes, content_type: Optional[str] = None) -> None:
    kwargs = {"Bucket": settings.s3_bucket, "Key": key, "Body": data}
    if content_type:
        kwargs["ContentType"] = content_type
    _s3.put_object(**kwargs)


def generate_signed_put_url(key: str, content_type: str, expires: int = 900) -> str:
    create_bucket_if_missing()
    return _s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.s3_bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=expires,
    )


def generate_presigned_get_url(key: str, expires: int = 900) -> str:
    return _s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires,
    )
