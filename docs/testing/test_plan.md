# Test Plan — Book Translator (Kindle_pdf_translation)

## 1. Scope and Objectives
- Validate the extract → translate → build_epub → flashcards pipeline end-to-end.
- Ensure correct handling of supported PDFs (≤100MB, ≤600 pages), error states (encrypted PDFs, missing files), and output artifacts.
- Verify non-functional attributes: reliability (idempotent jobs), observability (timing telemetry), and baseline performance (stage timings recorded).

## 2. Requirements Coverage Matrix
| Requirement | Tests | Level |
| PDF extraction produces normalized paragraphs | `backend/tests/pipeline/test_extract.py` | Unit/Integration |
| Translation pipeline persists artifacts | `backend/tests/pipeline/test_pipeline.py` | Integration |
| Flashcards are generated with expected headers | `backend/tests/test_utils.py`, `backend/tests/test_storage.py` | Unit |
| Storage backends write artifacts | `backend/tests/test_storage.py` | Unit |
| Provider selection and validation | `backend/tests/providers/*` | Unit |
| Job status updates and manifest payloads | `backend/tests/pipeline/test_pipeline.py` | Integration |
| Telemetry timings recorded | `backend/tests/test_telemetry.py` | Unit |

## 3. Test Levels and Strategy
- **Unit tests:** Providers, storage adapters, utility helpers, and telemetry timing logic.
- **Integration tests:** Pipeline flow including extraction, translation testing, artifact generation, and manifest updates.
- **System checks (manual):** Local docker-compose run verifying upload, progress updates, and artifact downloads.

## 4. Test Data
- `sample_paragraphs.pdf` for deterministic extraction.
- Synthetic small PDFs for size and page-limit checks (generated in tests where needed).
- Matched reference translations for accuracy checks in `backend/tests/fixtures/accuracy/`.

## 5. Entry/Exit Criteria
- **Entry:** Dependencies installed, environment variables configured for test mode (`TRANSLATOR_PROVIDER=hf`, `DB_MODE=manifests`).
- **Exit:** All tests pass; coverage threshold ≥ 70% line coverage for `backend/app`.

## 6. Coverage and Quality Targets
- **Coverage:** Enforced in CI via `pytest --cov=app --cov-fail-under=70`.
- **Performance:** Telemetry captures per-stage timings and writes to job manifests for analysis. 90% of jobs run in under 2 minutes.
- **Reliability:** Tests cover error paths for missing PDFs, encrypted PDFs, and mismatched translation counts.
- **Accuracy:** Reference translation checks use token-overlap similarity with a minimum per-paragraph threshold of 0.45 and an average threshold of 0.6.

## 7. Reporting
- CI logs provide test output and coverage summary.
- Telemetry results are stored in job manifests under `timings_ms` for post-run analysis.
- Accuracy checks are run manually with `TRANSLATION_ACCURACY=1 TRANSLATOR_PROVIDER=openai OPENAI_API_KEY=... pytest -m accuracy`.
