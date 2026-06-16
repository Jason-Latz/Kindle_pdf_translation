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
- ☑ A3 Landed `codex/cache-flashcard-tokenizers` (merge `0336d94`). README folded; test_plan kept deleted.
- ☑ A4 Landed `codex/pause-hidden-job-polling` (merge `b57c759`). Fixed an eslint exhaustive-deps warning the
  branch introduced (fed `shouldPollJobStatus` derived primitives, not the whole object — behavior unchanged).
- ☑ A5 Landed `codex/single-query-job-updates` (merge `9e71eb4`). `lib/jobs.ts` auto-merged correctly: A5's
  single-write `updateJobRecord` + main's hardened `markWorkflowStarting` (stale-reclaim) both intact, verified.
- ◐ A6 Local codex branches pruned (`avoid-pdf-buffer-copy`, `refactor-...` confirmed merged-to-main).
  **Remote prune deferred to the Phase G push** (delete origin/codex/{avoid-pdf-buffer-copy,
  refactor-repo-for-vercel-and-s3-deployment, cache-flashcard-tokenizers, pause-hidden-job-polling,
  single-query-job-updates} only after `origin/main` has everything). Keep `render`, `software-testing`, `backup/pre-split-1c1a2e9`.

**Phase B — red-team — DONE** (commits `1c34572`, `18e3298`, `7a5d7f0`; see also `docs/security.md`).
Two background agents (Workflow-retry research + adversarial sweep) informed the fixes.
- ☑ B1 Headline IDOR fixed: per-job 256-bit `download_token` (schema create-col + idempotent `alter`),
  returned only in the create response, required + `timingSafeEqual`-checked on download; client threads it.
- ☑ B2 `Content-Disposition` filename sanitized (`sanitizeDownloadFilename`, char-code based).
- ☑ B3 Deterministic parse failures throw `FatalError` (from `workflow`) → no 3× retry / OpenAI re-bill.
- ☑ B4 Idempotent start verified + tested (`tests/job-service.test.ts`); 10-min stale-reclaim documented.
- ☑ B5 `MAX_TRANSLATION_BATCHES` (default 150) cap via `chunkByTokensWithCap`, fails fast before any call.
- ☑ B6 Malformed/encrypted/image-only PDF error paths tested (`tests/pdf.test.ts`).
- ☑ B7 CSV formula injection neutralized in `csvEscape`.
- ☑ B8 + M3 input length bounds (filename 255 / path 1024 / lang 32); desync confirmed safe by agent.
- **Deferred (documented, not fixed):** H1 queue-callback app-layer auth (low risk: needs secret jobId +
  idempotent; fixing needs verified Vercel header-forwarding → could break prod delivery). M4 fully-public
  by design. See `docs/security.md` + GO-LIVE.

**Phase C — optimization & mistakes sweep**
- ☑ C1 Target-language SSOT: `lib/languages.ts` + `GET /api/languages`; client fetches the list (commit `9760eda`).
- ☑ C2 Dead-code sweep: removed unused `buildSourceBlobPath` (+ `randomUUID` import).

**Phase D — product gaps — DONE**
- ☑ D1 Chaptered EPUB + navigable TOC (commit `2fd17e6`): font-size/keyword heading detection in `lib/pdf.ts`
  (single-chapter fallback), chapters threaded through the workflow (flatten→translate→reassemble), `lib/epub.ts`
  multi-chapter + auto TOC. `ExtractedBook` now `chapters: Chapter[]`; dead `TranslatedBook` removed.
- ☑ D2 Richer flashcards (commit `c4e1263`): `word,translation,context` — per-word context sentence via cached
  sentence segmenter; frequency-ranked content words.
- ☑ D3 HF provider hardened + marked experimental (commit `4b5b4fe`): lenient JSON extraction, one-time warn,
  README note; switch already guards on missing `HF_MODEL_ID`.

**Phase E — tests to ship-grade — DONE** (commit `b2d1cc1`; suite now **58 tests / 13 files**, offline+mocked).
Added `translate-book` (pipeline + flatten/reassemble), `blob`, `api-routes` (healthz + jobs-POST token) on top of
the download-route / providers / job-service / jobs / languages / epub / pdf / flashcards / validation / job-polling tests.

**Phase F — verify + audit — DONE.** `npm run verify` GREEN. `npm audit --omit=dev` = 14 advisories: the documented
Next/PostCSS moderate + a high `esbuild` (GHSA-gv7w-rqvm-qjhr) via `@workflow/*` build tooling — a build/install-time
Deno/registry vector not run by the deployed runtime, no in-range fix; both documented in `docs/release.md` (commit `3d6c924`). Did NOT jump to `next@16`.

**Phase G — deploy + smoke — PARTIAL (blocker documented).** Pushed `origin/main` → `50b0ce9` (gate green); pruned the
5 remote codex branches. **BUT the push did not auto-deploy** — live prod is the 2026-05-03 (43d) deployment and no
build was triggered → GitHub→Vercel production auto-deploy is inactive. Live prod `GET /api/healthz` = `{ok:true}` (old
code). Did NOT force a `vercel --prod` autonomously (a 43d-stale prod implies deliberate deploys). Remediation + the
post-deploy pipeline smoke are in **GO-LIVE #1–3** (`CLAUDE.md`). Prod env vars verified set; Queues/Workflow toggles unverifiable via CLI.

**Phase H — ship prep — DONE.** `docs/launch/linkedin-post.md` (3 drafts, DO NOT POST); `CLAUDE.md` (durable anchor +
GO-LIVE) finalized; this ledger finalized; morning report generated.

## Findings / decisions / assumptions log

- **2026-06-16** Baseline gate green on main @ 40dd7ae (Node 22). Build emits all 11 routes, no warnings.
- **Job id entropy:** ids are `randomUUID().replace(/-/g,'')` = 32 hex / ~122 bits (CSPRNG) → not brute-forceable.
  So the download-auth risk is **capability leakage** (poll URLs, logs, history), not guessing. The token fix
  separates the download capability from the pollable id (defense-in-depth + ownership), which is the right minimal control.
- **Decision:** work directly on `main` per Jason's published convention (no PR). **Deploy timing:** accumulate
  all phases as local gate-green commits and push **once at Phase G** (one coherent ship-ready prod deploy +
  one smoke), rather than deploying a half-secured intermediate state. `origin/main` stays at `40dd7ae` until then.
- **Phase A done (2026-06-16):** 3 codex merges + ledger; local main is +10 vs origin; gate green after each merge.
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
