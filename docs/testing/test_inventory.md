# Test Inventory

This document summarizes the backend test suite and groups coverage by test type.

## Unit Tests
- `backend/tests/test_utils.py`: ID generation, job locks, and logging file creation.
- `backend/tests/test_tokenizers.py`: spaCy tokenizer selection and fallback behavior.
- `backend/tests/test_config.py`: Settings defaults and comma-separated parsing.
- `backend/tests/test_storage.py`: local storage write/read semantics.
- `backend/tests/test_telemetry.py`: timing aggregation and telemetry event handling.
- `backend/tests/providers/test_base.py`: provider selection and chunking helper validation.
- `backend/tests/providers/test_openai_provider.py`: OpenAI response parsing edge cases.
- `backend/tests/providers/test_hf_inference_provider.py`: HF parsing logic (guarded by `HF_MODEL_ID`).
- `backend/tests/test_providers.py`: HF stub provider and OpenAI key validation.
- `backend/tests/pipeline/test_build_epub.py`: EPUB assembly helpers and write behavior.
- `backend/tests/pipeline/test_flashcards.py`: token filtering, frequency scoring, and CSV output.
- `backend/tests/pipeline/test_translate.py`: translation batching, progress, and persistence.
- `backend/tests/pipeline/test_extract_more.py`: PDF block parsing edge cases and errors.
- `backend/tests/pipeline/test_extract.py`: baseline paragraph extraction behavior.
- `backend/tests/test_main.py`: FastAPI health check endpoint.

## Integration and Component Tests
- `backend/tests/pipeline/test_pipeline.py`: pipeline flow against a real PDF (HF path, gated by `HF_MODEL_ID`).
- `backend/tests/pipeline/test_pipeline_run.py`: pipeline orchestration with stubbed stages and manifest writes.
- `backend/tests/test_routes.py`: API endpoints, manifest-backed job reads, and artifact downloads.
- `backend/tests/test_db.py`: SQLite session setup/teardown and schema initialization paths.

## Accuracy and Quality Checks (Optional)
- `backend/tests/accuracy/test_translation_accuracy.py`: reference translation similarity checks.
  - Includes BLEU scoring via `sacrebleu` for the same reference pairs.
  - Requires `TRANSLATION_ACCURACY=1`, `TRANSLATOR_PROVIDER=openai`, and `OPENAI_API_KEY`.
- Fixtures used by accuracy tests:
  - `backend/tests/fixtures/accuracy/source_en.txt`
  - `backend/tests/fixtures/accuracy/target_es.txt`

## Environment Gates and Skips
- `HF_MODEL_ID` is required to exercise Hugging Face provider tests.
- `OPENAI_API_KEY` is required for OpenAI-backed accuracy checks.
- `greenlet` is required for async SQLAlchemy session close; the test skips if missing.
