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

`npm audit --omit=dev` reports two groups of advisories. Both are **accepted and documented**
rather than force-fixed (a `npm audit fix --force` would downgrade Next to a breaking version
and/or destabilize the Workflow build):

1. **Moderate — Next's nested PostCSS** (`postcss <8.5.10`, GHSA-qx2v-qp2m-jg93). The
   audit-suggested direct fix is `next@16.x` (preview/breaking), so this release stays on stable
   `next@15.5.19`. Safe Workflow transitives are lifted through `overrides`.

2. **High — esbuild via the `workflow` build tooling** (`esbuild 0.17.0–0.28.0`,
   GHSA-gv7w-rqvm-qjhr: missing binary-integrity verification in esbuild's **Deno** module →
   RCE via a malicious `NPM_CONFIG_REGISTRY`). It reaches the tree only through `@workflow/*`
   framework-integration build packages (`@workflow/builders` / `astro` / `nuxt` / `vite` /
   `rollup` / `next` …) pulled in by the `workflow` meta-package. This is a **build-/install-time
   supply-chain vector** (the Deno install path + an attacker-controlled registry); the deployed
   serverless runtime never executes esbuild, and installs use the official npm registry. There is
   no in-range fix — the advisory spans 0.17.0–0.28.0, so an `esbuild` override to 0.25 does not
   clear it, and forcing an out-of-range esbuild risks breaking the `'use workflow'` build
   transform. **Accepted as a documented, non-runtime-exploitable transitive; revisit when
   `workflow` ships a patched dependency tree.**
