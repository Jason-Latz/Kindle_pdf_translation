# Testing

The release gate is:

```bash
npm run verify
```

It runs:

- `npm run lint`
- `npm run test`
- `npm run typecheck`
- `npm run build`

Current automated coverage focuses on:

- upload/job metadata validation in `tests/validation.test.ts`
- PDF extraction and Buffer-backed byte handling in `tests/pdf.test.ts`
- flashcard CSV term selection and translation wiring in `tests/flashcards.test.ts`

Manual deployment smoke:

1. Verify `GET /api/healthz` returns `{ "ok": true }`.
2. Upload a small text-based PDF through the home page.
3. Confirm the job moves through queued, parsing, translating, EPUB, flashcard, and done states.
4. Download both the EPUB and flashcard CSV.

For deeper workflow debugging, use Vercel Workflow observability for step-level traces and Postgres for the current job row.
