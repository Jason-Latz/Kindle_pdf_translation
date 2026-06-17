# CLAUDE.md — Kindle PDF Translator

One-line contract: **turn a text-based PDF into a translated, Kindle-ready EPUB (chaptered,
with a navigable TOC) plus a study-flashcard CSV** — a serverless Next.js app on Vercel.

## ⚠️ Repo location (read first)

This file lives in the **real git repo**, which is **nested one level down** from the folder you
may have opened:

- Open folder (NOT a repo): `…/CS Classes/Projects/Kindle_PDF_Translator/`
- **Git repo + app (run everything here):** `…/Kindle_PDF_Translator/Kindle_pdf_translation/`

Ignore the outer `BOOK_TRANSLATOR_PROJECT copy.md` — it documents an **abandoned**
FastAPI/Celery/Redis/S3 design. The shipped app is the Vercel-native Next.js project here.

## Node / commands

`.nvmrc` pins **Node 22**. If there's no nvm, this machine has Homebrew `node@22` at
`/opt/homebrew/opt/node@22/bin` — prepend it: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`.

```bash
npm ci            # install (lockfile)
npm run dev       # local dev (needs a Blob token; workflow callbacks need a tunnel)
npm run verify    # RELEASE GATE: lint && test && typecheck && build — must pass before any push
npm run lint      # eslint --max-warnings=0   (zero warnings allowed)
npm run test      # vitest run
npm run typecheck # tsc --noEmit
npm audit --omit=dev          # see "Known advisories" below
npm run cleanup:intermediate-blobs   # dry-run; add `-- --apply` to delete orphaned blobs
```

## Deploy

**`git push origin main` auto-deploys PRODUCTION** (Vercel project `kindle-pdf-translation`,
git-linked; PRs get previews). Convention (per `AGENTS.md`): publish by pushing directly to
`main`, no PR. **Only push when `npm run verify` is green.** `vercel.json` only declares the
queue trigger for `app/api/queues/jobs`.

## Architecture map

Pipeline: `app/page.tsx` → `POST /api/uploads/pdf` (Blob client-upload token) →
`POST /api/jobs` (validate + insert + enqueue) → Vercel Queue topic `jobs` →
`POST /api/queues/jobs` → `startQueuedWorkflow` → `translateBookWorkflow`
(parse_pdf → translate → build_epub → flashcards → finalize → done). Client polls
`GET /api/jobs/[id]` (paused while the tab is hidden); downloads via
`GET /api/jobs/[id]/download?file_type=epub|flashcards&token=…`.

- `lib/config.ts` — env (zod). Notable: `TARGET_LANGS`, `MAX_PDF_MB`, `MAX_PAGES`,
  `MAX_FLASHCARDS`, `MAX_TRANSLATION_BATCHES` (LLM fan-out cap), `TRANSLATOR_PROVIDER`.
- `lib/jobs.ts` — Postgres (`postgres.js`). `ensureJobsTable()` creates the table at runtime
  (**no migrate command**); `updateJobRecord` is a single-write `UPDATE … CASE`;
  `markWorkflowStarting` is the idempotent `__starting__` lock (10-min stale reclaim).
- `lib/job-service.ts` — `createQueuedJob` (validates the head-Blob, generates the download
  token, enqueues) + `startQueuedWorkflow` (idempotent start guard).
- `lib/workflows/translate-book.ts` — the durable Workflow (`'use workflow'`/`'use step'`);
  flattens chapters → one translate step → reassembles translated chapters.
- `lib/pdf.ts` — pdfjs extraction + header/footer stripping + **chapter detection**
  (font-size / keyword headings, single-chapter fallback).
- `lib/providers.ts` — OpenAI (default) + Hugging Face (**experimental**) translation;
  deterministic parse failures throw `FatalError` (no retry/re-bill); batch cap enforced here.
- `lib/epub.ts` — `epub-gen-memory`, multi-chapter EPUB + auto TOC.
- `lib/flashcards.ts` — frequency-ranked vocabulary + per-word context sentence; CSV
  formula-injection-safe (`csvEscape`).
- `lib/languages.ts` + `GET /api/languages` — single source of truth for offered languages.
- `lib/blob.ts` (private Blob get/head/put), `lib/validation.ts` (upload-path + create-job),
  `lib/utils.ts` (paths, download token + constant-time compare, header-safe filename).
- `tests/` — Vitest (offline, mocked). `docs/` — `security.md`, `release.md`, `testing.md`,
  `pdf-parsing.md`, `job-status-polling.md`, `overnight-progress.md`, `launch/linkedin-post.md`.

## Conventions & gotchas

- **Schema changes** = edit the inline SQL in `ensureJobsTable()`; adding a column to an
  existing DB needs `alter table jobs add column if not exists …` (the bare
  `create table if not exists` won't alter a pre-existing table).
- **Secrets** live only in gitignored `.env` / `.env.local`; never commit values. `.env.example`
  (placeholders) is the tracked template.
- **Security model**: public/unauthenticated tool; artifact confidentiality is enforced by the
  per-job download token (see `docs/security.md`). Don't reintroduce a read-before-write in
  `updateJobRecord` or a per-paragraph tokenizer rebuild in flashcards (both are documented hot paths).
- **Known advisories** (`npm audit --omit=dev`): a moderate Next/nested-PostCSS advisory — do
  **not** "fix" by jumping to the `next@16` preview. (See `docs/release.md` for the current
  audit note, including the esbuild/`workflow` dev-tooling transitive status.)

## Top risks / GO-LIVE (human-gated — needs Jason)

1. **Reactivate the Vercel Blob store — it is SUSPENDED (blocks the whole pipeline).** The live
   smoke uploaded a PDF and got `BlobStoreSuspendedError: This store has been suspended`. Uploads,
   EPUB/flashcard writes, and downloads all need Blob, so nothing works end-to-end until you
   un-suspend it in the Vercel dashboard (Storage → the Blob store → reactivate; this is an
   account/billing action, so it was left for you). This almost certainly explains why prod sat
   stale and unused. After reactivating, re-run the smoke in #3.
2. **Confirm Queues + Workflow are enabled** on the Vercel project. Prod env vars are **verified
   set** (`TRANSLATOR_PROVIDER`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `POSTGRES_URL`/
   `DATABASE_URL`, `TARGET_LANGS`, limits — all Production), and Neon Postgres is wired. I couldn't
   reach the queue→workflow stage (the smoke stopped at the suspended Blob upload), so verify these
   platform toggles too — if a job sticks at `queued` after Blob is back, the trigger isn't firing.
3. **Re-run the live pipeline smoke after reactivating Blob** (`docs/testing.md`): upload a small
   text PDF and confirm the job polls `queued → … → done`, then download the EPUB + flashcards CSV
   (download URLs need `&token=<download_token>` from the create response). (Set scalar env with
   `vercel env add --value …`, not stdin piping.)
- **Rotate the dead AWS keys** that were in the local `.env` (removed from the file; revoke at
  source). Optional: rotate OpenAI/HF/Neon/Blob secrets as hygiene (never committed).
- Consider per-IP **rate limiting** on `/api/jobs` + `/api/uploads/pdf` before heavy public use
  (the app is intentionally public). Queue-callback app-layer auth (H1) is documented in
  `docs/security.md` as deferred (low real risk; a naive fix risks breaking queue delivery).

## Current state

Overnight hardening run completed **2026-06-16**: landed 3 codex branches; fixed the headline
unauthenticated-download IDOR + 7 more red-team items; added chaptered EPUB + richer flashcards;
brought the orchestration layer to real test coverage (61 tests). Pushed to `main` (`c17673f`) and
**deployed to prod** via `vercel --prod`; static/config/API routes verified live (a prod 500 from an
empty `OPENAI_BASE_URL` was caught and fixed). The end-to-end pipeline is **blocked by a suspended
Vercel Blob store** — see GO-LIVE #1. See `docs/overnight-progress.md` and `docs/security.md`.

## Change log

- **2026-06-16** — Created this file at the end of the overnight ship-ready run (Phases A–H).
