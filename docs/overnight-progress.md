# Overnight Progress — Kindle PDF Translator → ship-ready

> Cold-start anchor for an autonomous overnight run (started **2026-06-16**). If you are a
> post-compaction session, **re-read this file + the original mission prompt + the last ~10
> commits before acting.** This is the source of truth; trust it over re-exploration.

## Mission (one paragraph)

Take the Kindle PDF Translator from "works" to "demonstrably ship-ready": fix the local-dev
blocker, land three finished `codex/*` branches, red-team the security/correctness surface
(headline: unauthenticated download-by-job-id), close product gaps (chaptered EPUB + richer
flashcards), bring the orchestration layer to real test coverage, keep `npm run verify` green,
deploy to prod via push-to-main, and leave launch docs. Many small reviewable commits. Verify
before declaring done. No time estimates. Pause only for HUMAN-GATED items (§ below).

## Ground truth (trust over re-exploration)

- **NESTED REPO.** The git repo is **one level down**:
  `/Users/jason/Downloads/CS Classes/Projects/Kindle_PDF_Translator/Kindle_pdf_translation`.
  Run every git/npm command from there. Remote: `github.com/Jason-Latz/Kindle_pdf_translation`.
- **Branch:** `main`, authoritative single-project branch. Started clean at `40dd7ae`.
  Work happens **on main**; commit in small chunks; **push only when the gate is green**
  (push to `origin/main` auto-deploys **production** on Vercel project `kindle-pdf-translation`).
- **Stack:** Next.js 15.5 App Router (React 18, TS 5.5, Tailwind 3). Vercel Blob (private) for
  files, Neon/Marketplace Postgres (`postgres.js`) for job state, Vercel Queues (topic `jobs`)
  for ingress, Vercel Workflow 4.3 (`'use workflow'`/`'use step'`) for the pipeline. Translation
  via OpenAI SDK 5 (default) or Hugging Face. `pdfjs-dist` legacy build for parsing,
  `epub-gen-memory` for EPUB, `js-tiktoken`+`stopword`+`Intl.Segmenter` for flashcards. Vitest 4.
- **Node:** repo pins 22 (`.nvmrc`). This machine had **no nvm and only Homebrew Node 25** — I
  `brew install node@22`. **Node 22 lives at `/opt/homebrew/opt/node@22/bin`.** Every npm/node
  command must prepend it: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`. (`node -v` →
  v22.22.3, `npm -v` → 10.9.8.)
- **Pipeline:** `app/page.tsx` → `POST /api/uploads/pdf` (Blob client-upload token) →
  `POST /api/jobs` (`createQueuedJob`, validates + inserts + enqueues) → Queue topic `jobs` →
  `POST /api/queues/jobs` (`startQueuedWorkflow`) → `start(translateBookWorkflow)` →
  steps parse_pdf → translate → build_epub → flashcards → finalize → done. Client polls
  `GET /api/jobs/[id]` every 2s; downloads via `GET /api/jobs/[id]/download?file_type=epub|flashcards`.
- **Job state:** `jobs` table auto-created at runtime by `ensureJobsTable()` in `lib/jobs.ts`
  (`create table if not exists`). **No migrate command.** Schema changes = edit that inline SQL;
  **adding a column to an existing table needs `alter table ... add column if not exists`** (the
  bare `create table if not exists` will NOT add columns to a pre-existing table).
- **Commands** (from nested dir, Node 22 on PATH): install `npm ci` · dev `npm run dev` ·
  build `npm run build` · test `npm run test` · lint `npm run lint` (eslint `--max-warnings=0`) ·
  typecheck `npm run typecheck` · **release gate `npm run verify`** (lint && test && typecheck && build) ·
  audit `npm audit --omit=dev` · maintenance `npm run cleanup:intermediate-blobs` (dry-run).
- **Secrets:** real secrets live in gitignored `.env` and `.env.local` (Neon password, Blob token,
  OpenAI key, HF token, AWS keys, Vercel OIDC). `.gitignore` covers `.env` + `.env*.local`; verified
  **never committed**. **Never put secret values in any committed file (incl. this ledger).**
- **IGNORE:** root `BOOK_TRANSLATOR_PROJECT copy.md` (abandoned FastAPI/Celery/Redis/S3 design).
  Do NOT merge branches `render`, `software-testing`, `backup/pre-split-1c1a2e9`.

## Plan checklist (status: ☐ todo · ◐ in progress · ☑ done)

**Phase A — fix dev + land in-flight work**
- ☑ A1 Fix `.env.local` `TRANSLATOR_PROVIDER` (inline comment was inside quotes → failed zod enum);
  also fixed mangled `TARGET_LANGS`; reconciled `.env` (removed dead S3/DB_MODE/STORAGE_BACKEND/
  TRANSLATION_ACCURACY keys). Local-only, gitignored, no secrets committed.
- ☑ A2 Baseline `npm ci && npm run verify` GREEN on `main` @ 40dd7ae under Node 22.
- ☐ A3 Land `origin/codex/cache-flashcard-tokenizers` (cache `Intl.Segmenter`; trivial README conflict).
- ☐ A4 Land `origin/codex/pause-hidden-job-polling` (`lib/job-polling.ts` + page wiring; trivial README conflict).
- ☐ A5 Land `origin/codex/single-query-job-updates` (single-write `updateJobRecord`; **real `lib/jobs.ts` conflict** — do last/carefully). NOTE: must reconcile with the download-token column added in Phase B.
- ☐ A6 Prune `codex/avoid-pdf-buffer-copy`, `codex/refactor-repo-for-vercel-and-s3-deployment` (local+remote).

**Phase B — red-team (reproduce w/ test → fix → keep as regression guard)**
- ☐ B1 **Unauth download-by-job-id** (headline). `download/route.ts` streams private blob by id, no
  ownership check. Plan: download/ownership token issued at job creation, required on download,
  NOT returned by the poll endpoint. Needs `download_token` column (alter table add column if not exists),
  create-response carries token, client threads it into download URLs.
- ☐ B2 Content-Disposition filename uses raw `job.filename` (only `.pdf`-suffix-validated, not sanitized)
  → quote/`..` spoofing. Sanitize the response filename. (Blob artifact paths already safe via `sanitizeFilename`.)
- ☐ B3 LLM trust: `parseTranslationPayload` requires exact array-length match; verify clean `error`
  state + that queue retries don't double-start (idempotent start guards this).
- ☐ B4 Workflow idempotency: `markWorkflowStarting` atomic `update...where` is concurrency-safe;
  document the 10-min stale-reclaim double-run edge. Add tests around `startQueuedWorkflow` guard.
- ☐ B5 Cost cap: `translateBatch` chunks by 5000-token budget with **no overall cap** → unbounded
  LLM calls on a large in-limit PDF. Add a configurable paragraph/token cap with a clean error.
- ☐ B6 Malformed/encrypted/image-only PDFs: error paths exist; add fuzz/regression tests for clean failure.
- ☐ B7 CSV injection: `csvEscape` only doubles quotes; neutralize values starting with `= + - @` (and tab/CR).
- ☐ B8 Upload desync: upload token restricts contentType/size; non-PDF bytes fail cleanly in parse. Low risk; confirm + test.

**Phase C — optimization & mistakes sweep**
- ☐ C1 SSOT for target languages: client `components/TargetLangSelect.tsx` hardcodes es/fr/de/it/pt while
  server validates `config.targetLangs` (env). Plan: server endpoint (e.g. `/api/languages`) + shared
  `lib/languages.ts` label map; client fetches supported langs (page.tsx is `'use client'`).
- ☐ C2 General sweep for dead code / correctness / efficiency.

**Phase D — product gaps**
- ☐ D1 Chapter detection → chaptered EPUB w/ navigable TOC. `lib/pdf.ts` currently emits a flat paragraph
  array (and discards font size); `lib/epub.ts` emits one flat chapter. Capture font height + heading
  heuristics (size/numbering/"Chapter N"), thread chapter structure through workflow state, emit multi-chapter EPUB.
- ☐ D2 Richer flashcards: rarity/frequency-aware selection + richer CSV (`word,translation,context_sentence`),
  optional per-chapter top-N. Currently global top-N `word,translation` only.
- ☐ D3 HF provider robust-or-quarantine: `createHfProvider` posts a plain prompt expecting JSON; fragile,
  untested. Make robust + tested OR mark experimental and guard the switch.

**Phase E — tests to ship-grade** (orchestration layer has ZERO coverage today)
- ☐ Tests for `lib/jobs.ts`, `lib/job-service.ts`, `lib/workflows/translate-book.ts`, `lib/providers.ts`
  (OpenAI+HF parse/failure), `lib/epub.ts`, `lib/blob.ts`, API routes (incl. download-auth). Mock external services; keep offline/fast. No new eslint warnings.

**Phase F — verify** ☐ `npm run verify` clean; `npm audit --omit=dev` shows only the documented Next/PostCSS moderate advisory. Do NOT jump to `next@16`.

**Phase G — deploy + smoke** ☐ Push `origin/main` (only when green) → prod. Smoke per `docs/testing.md`:
`/api/healthz`→`{ok:true}`; upload one small text PDF; watch poll to `done`; download EPUB + CSV. Record any missing Vercel resources in GO-LIVE. One tiny PDF of OpenAI spend authorized; no large books.

**Phase H — ship prep** ☐ `docs/launch/linkedin-post.md` (2–3 drafts, DO NOT POST) + finalize `CLAUDE.md` + GO-LIVE checklist.

## Findings / decisions / assumptions log

- **2026-06-16** Baseline gate green on main @ 40dd7ae (Node 22). Build emits all 11 routes, no warnings.
- **Job id entropy:** ids are `randomUUID().replace(/-/g,'')` = 32 hex / ~122 bits (CSPRNG) → not brute-forceable.
  So the download-auth risk is **capability leakage** (poll URLs, logs, history), not guessing. The token fix
  separates the download capability from the pollable id (defense-in-depth + ownership), which is the right minimal control.
- **Decision:** work directly on `main` per Jason's published convention (no PR); push only at green checkpoints.
- **Assumption:** Vercel project already has Blob/Neon/Queues/Workflow + provider env wired (the `.env.local`
  was created by Vercel CLI and references project `kindle-pdf-translation`). Live-deploy blockers, if any, go to GO-LIVE.
- **Phase ordering note:** A5 (single-query-job-updates) rewrites `lib/jobs.ts`; the B1 download-token column
  also touches `lib/jobs.ts`. Land A5 first, then add the column on top, to avoid a second hard conflict.

## How to verify (any session)
```
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
cd "/Users/jason/Downloads/CS Classes/Projects/Kindle_PDF_Translator/Kindle_pdf_translation"
npm run verify           # lint && test && typecheck && build — must be green before any push
npm audit --omit=dev     # only the documented Next/PostCSS moderate advisory is acceptable
```

## Open questions / HUMAN-GATED (for Jason — see GO-LIVE in CLAUDE.md when finalized)
- **Rotate the dead AWS keys** found in `.env` (S3_ACCESS_KEY/S3_SECRET_KEY from the abandoned design) —
  removed from the local file, but they should be revoked at the source. Consider rotating the OpenAI/HF/Neon/Blob
  secrets too (they sit in plaintext local files; never committed, so not urgent).
- Confirm Vercel project has Blob (private) + Neon Postgres + Queues + Workflow + OpenAI env enabled for prod.
- Download-auth control changes the API contract (adds a token to the create response + download URL) — chosen as
  the minimal correct fix; flag if a different model (signed URL / fully-anon) is preferred.
