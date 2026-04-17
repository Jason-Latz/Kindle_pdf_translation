# Book Translator

Turn a text-based PDF into a translated EPUB and a flashcard CSV.

The app is now a single root-level Next.js project. PDFs upload directly to private Vercel Blob storage, job metadata lives in Postgres, a `jobs` queue buffers new work, and one Workflow run owns the long-running translation pipeline.

## Architecture

- `app/`: Next.js App Router pages and API routes
- `components/`: upload, progress, and download UI
- `lib/`: config, Blob/Postgres helpers, validation, pipeline stages, workflow
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
- `QUEUE_REGION`

## Local Development

Install and run:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Notes:

- Client uploads require a working Blob token.
- Workflow webhook callbacks do not work against bare localhost unless you expose the app through a tunnel and configure `VERCEL_BLOB_CALLBACK_URL`.
- The build currently succeeds on Next 14 with the Workflow integration, but the Workflow plugin emits a harmless config warning about `turbopack`.

## Verification

Run the basic checks:

```bash
npm run test
npm run build
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

- `POST /api/jobs` validates file type, file size, blob path, and target language before inserting a job.
- Page-count, encrypted-PDF, and image-only checks run inside the `parse_pdf` workflow stage so job creation stays fast and does not re-read the uploaded PDF twice.
- The legacy `backend/` and `frontend/` directories are no longer part of the runtime path.
