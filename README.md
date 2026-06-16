# Book Translator

Turn a text-based PDF into a translated EPUB and a flashcard CSV.

This repository ships one root-level Next.js App Router project. PDFs upload directly to private Vercel Blob storage, job metadata lives in Postgres, the `jobs` queue buffers new work, and one Workflow run owns the long-running translation pipeline.

## Architecture

- `app/`: Next.js App Router pages and API routes
- `components/`: upload, progress, and download UI
- `lib/`: config, Blob/Postgres helpers, validation, pipeline stages, workflow
- `tests/`: Vitest unit coverage and PDF fixtures
- `vercel.json`: queue trigger for `app/api/queues/jobs/route.ts`

The runtime API surface is:

- `POST /api/uploads/pdf`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/download?file_type=epub|flashcards`
- `POST /api/queues/jobs`
- `GET /api/healthz`

## Environment

Copy `.env.example` and set the values you need:

```bash
cp .env.example .env
```

Required for the Vercel-native flow:

- `BLOB_READ_WRITE_TOKEN`
- `POSTGRES_URL` or `DATABASE_URL`
- `TRANSLATOR_PROVIDER=openai|hf`
- `OPENAI_API_KEY` when using OpenAI
- `HF_MODEL_ID` and optionally `HF_API_TOKEN` when using Hugging Face

Optional:

- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `HF_BASE_URL`
- `TARGET_LANGS`
- `MAX_PDF_MB`
- `MAX_PAGES`
- `MAX_FLASHCARDS`
- `QUEUE_REGION` (defaults to `VERCEL_REGION`, then `iad1`)

## Local Development

Use Node 22 locally:

```bash
nvm use
npm ci
npm run dev
```

Then open `http://localhost:3000`.

Notes:

- Client uploads require a working Blob token.
- Workflow webhook callbacks do not work against bare localhost unless you expose the app through a tunnel and configure `VERCEL_BLOB_CALLBACK_URL`.

## Verification

Run the release gate:

```bash
npm run verify
```

## Deployment

Deploy the repo root as one Vercel project.

Provision and connect:

1. A private Vercel Blob store.
2. A Marketplace Postgres integration.
3. Vercel Queues + Workflow on the target account.

Set the same environment variables in Vercel, then verify:

```bash
https://<your-domain>/api/healthz
```

## Implementation Notes

- `POST /api/uploads/pdf` only grants private Blob upload tokens for validated `source/*.pdf` paths.
- `POST /api/jobs` validates file type, file size, Blob metadata, Blob path, and target language before inserting a job.
- Page-count, encrypted-PDF, and image-only checks run inside the `parse_pdf` workflow stage so job creation stays fast and does not re-read the uploaded PDF twice.
- Generated workflow routes live under `app/.well-known/workflow/` and are intentionally ignored.
- Flashcard term extraction reuses one `Intl.Segmenter` and stopword set per language, so long books do not rebuild the same tokenizer helpers for every paragraph during the final workflow stage.
- The home page pauses `/api/jobs/:id` polling while the tab is hidden, then refreshes once immediately when the page becomes visible again. See [docs/job-status-polling.md](docs/job-status-polling.md).
- Workflow stage progress updates intentionally use a single `UPDATE ... RETURNING` write in `lib/jobs.ts`; avoid reintroducing a read-before-write query on that hot path.

## Release Notes

See `docs/release.md` for the release checklist, known dependency audit notes, and deployment smoke steps.
