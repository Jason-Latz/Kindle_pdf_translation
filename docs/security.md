# Security Notes

Threat-model and control summary for the Book Translator. This is a **public,
unauthenticated tool**: there are no user accounts or sessions. The design goal
is that artifacts stay confidential to whoever created a job, and that abuse of
the public endpoints is bounded.

## Controls in place

- **Artifact download requires a per-job token.** `GET /api/jobs/:id/download`
  requires a `token` query param that is compared in constant time
  (`timingSafeEqual`) against a 256-bit `download_token` generated at job
  creation. The token is returned **only** in the `POST /api/jobs` creation
  response — never in the pollable `GET /api/jobs/:id` status — so a job id
  leaked from a poll URL does not grant download access. Job ids themselves are
  128-bit CSPRNG values (`crypto.randomUUID`), so they are not enumerable.
- **Download filename is sanitized** before going into `Content-Disposition`
  (control chars, quotes, backslash stripped; length capped) to prevent header
  injection / response splitting.
- **Upload path is validated** (`source/<single-safe-segment>.pdf`; no `/`,
  no `..`, charset-restricted) and the issued Blob client-upload token pins
  `allowedContentTypes: ['application/pdf']`, a max size, `addRandomSuffix:false`,
  `allowOverwrite:false`. Job creation re-verifies the stored blob's content
  type and size against the request — a client cannot desync them.
- **Artifact blob paths are server-derived** (`artifacts/<jobId>/<sanitized>`);
  client input never selects which blob the download route reads.
- **LLM cost / fan-out is bounded** by `MAX_TRANSLATION_BATCHES` (default 150);
  oversize documents fail fast (`FatalError`) before any provider call.
- **No double-billing on bad model output:** deterministic translation parse
  failures throw `FatalError`, so the Workflow runtime does not retry (and
  re-bill) a request that cannot succeed. Transient API errors stay retryable.
- **Workflow start is idempotent** (`markWorkflowStarting` atomic
  `UPDATE ... WHERE workflow_run_id IS NULL OR stale __starting__`), so racing
  queue deliveries cannot launch duplicate runs; a crashed start is reclaimed
  after 10 minutes.
- **CSV formula injection neutralized:** flashcard cells beginning with
  `= + - @` / tab / CR are prefixed with `'`.
- **Input bounds:** `filename` ≤ 255, `sourcePathname` ≤ 1024, `targetLang` ≤ 32.
- **SQL** uses `postgres.js` parameterized tagged templates only (no `unsafe`/raw).
- **Secrets** live only in gitignored `.env` / `.env.local`; only
  `.env.example` (placeholders) is tracked.

## Documented residual risks (deferred, with rationale)

- **Queue callback is not authenticated at the application layer.**
  `POST /api/queues/jobs` relies on `@vercel/queue`'s `handleCallback`, which
  validates the CloudEvent shape but performs **no signature/secret check**.
  Triggering work still requires a valid (secret) job id and is idempotent, so
  it cannot be enumerated into arbitrary spend; the practical risk is low and
  bounded by `MAX_TRANSLATION_BATCHES`. A shared-secret header gate is the
  recommended hardening, but it must be verified against Vercel's actual
  queue-delivery header forwarding first (an unverified gate could silently
  break production delivery). **Tracked for follow-up; not changed here.**
- **The app is fully public (no user auth).** Anyone can create jobs / mint
  upload tokens. This is the intended design for a public demo tool. Add coarse
  rate limiting (per-IP) before any heavy public exposure.
- **Operator-only SSRF surface:** `OPENAI_BASE_URL` / `HF_BASE_URL` are
  `z.url()`-validated env vars; no request data flows into them, so this is only
  a risk if an operator points them at an internal host. No action needed.
- **Error messages** may include library/parse detail (e.g. pdf.js) in the job
  `error` field. Low severity (no secrets); could be genericized later.

## Operator action (see GO-LIVE in CLAUDE.md)

- Revoke the **dead AWS keys** that were present in the local `.env` (leftover
  from the abandoned S3 design); they have been removed from the file but should
  be rotated at the source. Consider rotating the OpenAI/HF/Neon/Blob secrets as
  routine hygiene (they were never committed).
