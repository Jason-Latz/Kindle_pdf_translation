# Test Plan — Book Translator (Kindle_pdf_translation)

## 1. Scope and Objectives
- Validate the root-level Next.js upload → queue → workflow → download flow end-to-end.
- Ensure correct handling of supported PDFs (≤100MB, ≤600 pages), error states (encrypted PDFs, missing files), and output artifacts.
- Verify the anonymous polling contract remains stable while the runtime moved from FastAPI to Vercel-native services.

## 2. Requirements Coverage Matrix
| Requirement | Tests | Level |
| Upload metadata validation | `tests/validation.test.ts` | Unit |
| Flashcard CSV generation | `tests/flashcards.test.ts` | Unit |
| PDF extraction cleanup and limits | `lib/pdf.ts` targeted unit tests | Unit |
| Queue consumer idempotence | route/service tests with mocked `workflow/api` | Unit |
| Job routes preserve polling/download contract | Next route tests with mocked Blob/Postgres | Integration |
| Queue → workflow → artifact flow | end-to-end smoke on Vercel or local tunnel setup | E2E |

## 3. Test Levels and Strategy
- **Unit tests:** validation, token/term selection helpers, provider adapters, and PDF cleanup logic.
- **Integration tests:** route handlers with mocked Blob, Queue, Workflow, and Postgres dependencies.
- **System checks (manual):** one client upload to Blob, one queued job, one successful workflow completion, and both downloads.

## 4. Test Data
- `sample_paragraphs.pdf` for deterministic extraction.
- Synthetic small PDFs for size and page-limit checks.
- Mocked translation provider responses for stable CSV/EPUB assertions.

## 5. Entry/Exit Criteria
- **Entry:** `npm install` completed and env configured for the chosen provider plus Blob/Postgres access where integration coverage is required.
- **Exit:** `npm run test` and `npm run build` pass; manual smoke covers upload, polling, and downloads.

## 6. Coverage and Quality Targets
- **Coverage:** Grow Vitest coverage around `lib/` and route handlers as the migration stabilizes.
- **Performance:** `POST /api/jobs` should stay fast because queue publication is the only long-running work in the request path.
- **Reliability:** Tests cover invalid upload metadata, encrypted/image-only PDFs, and duplicate queue delivery.
- **Contract stability:** polling and download responses stay backward-compatible with the previous UI contract.

## 7. Reporting
- CI logs provide Vitest output and the Next build result.
- Workflow observability in Vercel replaces the old manifest timing trail for deep execution tracing.
- Manual deploy verification is `GET /api/healthz` plus one full upload/download smoke test.
