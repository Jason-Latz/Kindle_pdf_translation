# Release Checklist

## Scope

This release ships the single Next.js/Vercel implementation only. The old FastAPI backend, standalone frontend, Docker Compose setup, and AWS deployment plan were removed from the tracked tree.

## Required Checks

Run before tagging:

```bash
npm ci
npm run verify
npm audit --omit=dev
```

## Deployment Smoke

After deploying the repo root to Vercel:

1. Confirm Blob, Postgres, Queue, and Workflow integrations are connected.
2. Confirm provider environment variables are set for either OpenAI or Hugging Face.
3. Open `/api/healthz`.
4. Upload a small text-based PDF.
5. Confirm job polling reaches `done`.
6. Download both artifacts.

## Known Audit Notes

`npm audit --omit=dev` currently reports Next's nested PostCSS copy. The audit-suggested direct fix is `next@16.3.0-preview.0`, so this release stays on stable `next@15.5.19` and documents the remaining moderate advisory rather than moving production to a preview framework version. Safe Workflow transitives are lifted through `overrides`.
