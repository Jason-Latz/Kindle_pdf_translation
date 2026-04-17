# One Vercel-Project Rewrite: Next.js + Workflow + Queues

## Summary

Refactor the repo into a single root-level Next.js App Router project and remove the separate FastAPI deployment model. Keep the product behavior the same where it matters: anonymous jobs, polling-based progress, EPUB + CSV outputs, target-language selection, and configurable OpenAI/HF translation providers. Replace the old Python `BackgroundTasks` backend with a Vercel-native flow built from Blob client uploads, one Queue for job ingress, and one Workflow for durable multi-step execution.

This is a clean-slate simplification, not a compatibility layer. The final deployable is one Vercel project, one codebase, one runtime stack, and one storage story.

## Implementation Changes

### 1. Collapse the repo into one Next.js app

- Promote the current `frontend/` app to the repo root and make it the only deployable application.
- Remove the `backend/` deployable, its Vercel config, Python runtime, and the `NEXT_PUBLIC_API_BASE` rewrite model.
- Keep docs, samples, and non-app assets at the repo root, but the only runtime code should be Next.js `app/`, `components/`, and `lib/`.
- Add a root `vercel.json` only for queue consumer trigger configuration if required; otherwise let Next.js own routing.

### 2. Replace file uploads with Vercel Blob client uploads

- Stop sending PDFs through `POST /api/jobs`; that route can no longer accept multipart PDFs because Vercel Functions cap request bodies at 4.5 MB.
- Add a Blob client-upload token route, e.g. `POST /api/uploads/pdf`, using `@vercel/blob/client`.
- Upload PDFs directly from the browser to a private Blob store.
- After upload completes, the browser calls `POST /api/jobs` with JSON metadata only:
  - `sourcePathname`
  - `filename`
  - `sizeBytes`
  - `targetLang`
- Validate file type, configured size limit, blob path, and target language server-side before inserting the job.
- Keep `POST /api/jobs` fast by deferring page-count, encrypted-PDF, and image-only validation to the `parse_pdf` workflow stage instead of re-reading the uploaded blob during job creation.

### 3. Replace the FastAPI job runner with Queue + Workflow

- Keep `POST /api/jobs` fast: insert a queued job row, publish one `job.created` message to a single `jobs` queue, and return the current job status immediately.
- Add one queue consumer route, e.g. `POST /api/queues/jobs`, that idempotently starts the workflow for a job and records the workflow run identifier on the job row.
- Implement one durable workflow, e.g. `translateBookWorkflow(jobId)`, as the only long-running pipeline coordinator.
- The workflow owns all stage transitions and writes progress directly to the `jobs` table:
  - `queued`
  - `parse_pdf`
  - `translate`
  - `build_epub`
  - `flashcards`
  - `finalize`
  - `done` / `error`
- Keep the queue surface intentionally small: queue for ingress/buffering, workflow for all actual orchestration.

### 4. Rebuild the pipeline in TypeScript with smaller, explicit boundaries

- Port PDF extraction to Node using `pdfjs-dist`; preserve the current behavior that matters:
  - reject encrypted PDFs
  - reject empty/image-only PDFs
  - enforce max size and max pages
  - remove repeated headers/footers using y-position heuristics
  - dehyphenate line breaks into paragraphs
- Port translation batching to TypeScript using `js-tiktoken` for chunking.
- Keep a small provider interface with exactly two implementations:
  - OpenAI
  - Hugging Face inference
- Keep provider selection server-side via environment variable; do not add a provider selector to the UI.
- Build EPUBs in TypeScript with `epub-gen-memory`.
- Generate flashcards in TypeScript with `Intl.Segmenter` + `stopword` + simple frequency scoring, then translate the chosen terms through the selected provider.
- Upload the generated EPUB and CSV into the same private Blob store and save their blob pathnames on the job row.

### 5. Simplify persistence and public API shape

- Use a Vercel-connected Postgres integration (Neon or equivalent via Marketplace), not the old SQLite/manifests split.
- Replace the old persistence modes with one `jobs` table only. Required columns:
  - `id`
  - `filename`
  - `source_blob_path`
  - `target_lang`
  - `provider`
  - `status`
  - `stage`
  - `pct`
  - `error`
  - `workflow_run_id`
  - `epub_blob_path`
  - `flashcards_blob_path`
  - `created_at`
  - `updated_at`
- Do not add a separate events table in v1; the UI only needs current state, and deep execution history can live in Workflow observability.
- Preserve the existing polling contract for status and downloads:
  - `POST /api/jobs` returns the same shape as today: `job_id`, `status`, `stage`, `pct`, `error`
  - `GET /api/jobs/[id]` returns the same shape
  - `GET /api/jobs/[id]/download?file_type=epub|flashcards` remains the download surface
- Keep downloads anonymous by job ID. Download routes should fetch from private Blob and stream the file; do not expose public blob URLs directly.
- Keep a simple `/healthz` route in the Next app for deploy verification.

## Test Plan

- Unit-test upload token generation and validation for file type, size limit, and target language.
- Unit-test the queue consumer to ensure job-start is idempotent and does not launch duplicate workflows.
- Unit-test workflow stage helpers:
  - header/footer stripping
  - paragraph normalization/dehyphenation
  - token batching
  - provider adapters
  - flashcard term selection
  - EPUB assembly
- Integration-test route handlers with mocked Blob, Queue, Workflow, and Postgres:
  - successful upload metadata -> job creation -> queue publish
  - status polling during each stage
  - artifact download lookup and streaming
- End-to-end smoke test:
  - client upload to Blob
  - create job
  - queue starts workflow
  - workflow reaches `done`
  - download EPUB and flashcards
- Failure scenarios:
  - oversized PDF
  - encrypted PDF
  - image-only/empty PDF
  - provider failure mid-translation
  - workflow retry after partial progress
  - duplicate queue delivery for the same job

## Assumptions and Defaults

- Vercel Workflow and Vercel Queues beta features are available on the target Vercel account.
- The final architecture is intentionally one root-level Next.js project; no Python service remains in production.
- Storage is fully Vercel-native: private Blob for source/artifact files and a Vercel-connected Postgres integration for metadata.
- Anonymous access remains the product model; no auth is introduced in this refactor.
- The provider switch remains, but only as a server-side config choice; UI stays provider-agnostic.
- Existing target languages and stage names are preserved unless a concrete implementation constraint forces a rename.
- The migration is complete only when `backend/` is no longer required for local dev, CI, or deployment, and the README/deploy instructions describe a single Vercel project.
