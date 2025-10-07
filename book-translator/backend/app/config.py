from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = Field(default="dev", alias="APP_ENV")
    database_url: str = Field(..., alias="DATABASE_URL")
    redis_url: str = Field(..., alias="REDIS_URL")

    s3_endpoint_url: str = Field(..., alias="S3_ENDPOINT_URL")
    s3_region: str = Field(..., alias="S3_REGION")
    s3_bucket: str = Field(..., alias="S3_BUCKET")
    s3_access_key: str = Field(..., alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(..., alias="S3_SECRET_KEY")

    openai_api_key: str = Field(..., alias="OPENAI_API_KEY")
    openai_model: str = Field("gpt-4o-mini", alias="OPENAI_MODEL")

    max_upload_mb: int = Field(100, alias="MAX_UPLOAD_MB")
    max_pages: int = Field(600, alias="MAX_PAGES")
    max_characters: int = Field(1_200_000, alias="MAX_CHARACTERS")
    max_paragraphs: int = Field(50_000, alias="MAX_PARAGRAPHS")
    max_chapters: int = Field(200, alias="MAX_CHAPTERS")

    supported_tgt_langs_raw: str = Field("es,fr,de,it,pt", alias="SUPPORTED_TGT_LANGS")
    default_src_lang: str = Field("en", alias="DEFAULT_SRC_LANG")
    default_tgt_lang: str = Field("es", alias="DEFAULT_TGT_LANG")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def supported_tgt_langs(self) -> List[str]:
        return [lang.strip() for lang in self.supported_tgt_langs_raw.split(",") if lang.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]
