from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace

import pytest

from app.storage.local import LocalStorage
from app.storage.s3_compat import S3Config, S3Storage


def test_local_storage_round_trip(tmp_path) -> None:
    storage = LocalStorage(base_dir=tmp_path)

    upload_data = BytesIO(b"pdf-bytes")
    saved_path = storage.save_upload("job42", "book.pdf", upload_data)
    assert saved_path.exists()
    assert saved_path.read_bytes() == b"pdf-bytes"

    artifact_path = storage.artifact_path("job42", "book.epub")
    assert artifact_path.parent.exists()
    artifact_path.write_bytes(b"epub-bytes")

    with storage.open_artifact(artifact_path, "rb") as fh:
        assert fh.read() == b"epub-bytes"


class _DummyS3Body:
    def __init__(self, data: bytes):
        self._buffer = BytesIO(data)

    def read(self) -> bytes:
        return self._buffer.read()


class _DummyS3Client:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes) -> None:
        self.objects[(Bucket, Key)] = Body

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, _DummyS3Body]:
        data = self.objects[(Bucket, Key)]
        return {"Body": _DummyS3Body(data)}


def test_s3_storage_uses_client(monkeypatch) -> None:
    dummy_client = _DummyS3Client()

    def fake_client(*args, **kwargs):
        return dummy_client

    fake_boto3 = SimpleNamespace(client=fake_client)
    monkeypatch.setattr("app.storage.s3_compat.boto3", fake_boto3)

    config = S3Config(
        endpoint="http://example",
        access_key="access",
        secret_key="secret",
        bucket="bucket",
        region="us-east-1",
    )
    storage = S3Storage(config)

    upload_key = storage.save_upload("job7", "book.pdf", BytesIO(b"upload-bytes"))
    assert upload_key == "uploads/job7/book.pdf"
    assert dummy_client.objects[(config.bucket, upload_key)] == b"upload-bytes"

    artifact_key = storage.put_artifact("artifacts/job7/book.epub", BytesIO(b"epub"))
    assert artifact_key == "artifacts/job7/book.epub"
    assert dummy_client.objects[(config.bucket, artifact_key)] == b"epub"

    dummy_client.objects[(config.bucket, artifact_key)] = b"download"
    body = storage.open_artifact(artifact_key)
    assert body.read() == b"download"
