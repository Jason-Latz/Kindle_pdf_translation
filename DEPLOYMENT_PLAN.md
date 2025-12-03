# Render Deployment Plan (Beginner-Friendly, Single Dockerfile)

Goal: run both the FastAPI backend and the exported Next.js frontend in one container on Render. Render builds from a single `Dockerfile` in the repo root (added). The frontend is statically exported and served by FastAPI; artifacts and uploads can live on a Render persistent disk.

## What’s in this repo now
- Root `Dockerfile`: multi-stage build. Stage 1 builds the Next.js static site; Stage 2 builds the FastAPI backend and copies the static site to `/app/frontend_static`. `uvicorn` serves both API and static.
- `backend/app/main.py`: now mounts static files if `/app/frontend_static` exists.
- Default ports: backend listens on 8000; frontend is served at `/` by the same process.

## Prerequisites (step by step)
1) Create a Render account at https://render.com (free tier is enough to test).
2) Install Docker locally (Docker Desktop) so you can test the build if desired.
3) Clone your repo and ensure the `Dockerfile` is in the repo root (done).
4) Decide on storage:
   - Easiest: use a Render Persistent Disk mounted at `/app/data` and set `STORAGE_BACKEND=local`.
   - Optional: use S3 if you already have it; set `STORAGE_BACKEND=s3` and supply S3 credentials.

## Environment variables to set in Render
- `TRANSLATOR_PROVIDER` (e.g., `openai`)
- `OPENAI_API_KEY` (if using OpenAI)
- `STORAGE_BACKEND` = `local` (simplest) or `s3`
- `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT` (only if using s3 backend)
- `DB_MODE=manifests`
- `MAX_PDF_MB`, `MAX_PAGES`, `TARGET_LANGS`
- `CORS_ALLOW_ORIGINS=*` (since frontend is same origin)
- Optional: `NEXT_PUBLIC_API_BASE` build arg (Render passes env at build time). You can set it to `https://<your-render-subdomain>.onrender.com` or just leave it blank because the frontend fetches `/api/...` relative to the same host. If you want to be explicit, add it as an env var in Render; it will be used during `npm run build`.

## Create the Render service (Web Service using Dockerfile)
1) In Render, click “New” → “Web Service”.
2) Connect the Git repo for this project.
3) When prompted:
   - Environment: Docker.
   - Region: pick closest.
   - Branch: main (or your branch).
   - Instance type: start with the smallest that fits (512 MB–1 GB RAM; bump if out of memory).
   - Auto deploy: your choice.
4) Add a Persistent Disk (recommended for `STORAGE_BACKEND=local`):
   - Name: `data`
   - Mount path: `/app/data`
   - Size: choose based on expected file size (e.g., 5–10 GB to start).
5) Add the environment variables above in the “Environment” section.
6) Render will auto-detect and build using the root `Dockerfile`. Build command is not needed; the Dockerfile handles the multi-stage build. Render provides a `PORT` env var automatically; the container listens on that port (defaults to 8000 if not set).

## How the Dockerfile works (summary)
- Stage `frontend`: installs Node deps, builds Next.js, runs `next export` to produce static files.
- Stage `backend`: installs Python deps, copies backend source, copies static files into `/app/frontend_static`, creates `/app/data`, then starts `uvicorn app.main:app` on port 8000.
- Render exposes the container port automatically; your service URL will look like `https://<service>.onrender.com`.

## Test after deploy
1) Wait for the first deploy to finish (Render dashboard shows logs).
2) Visit your Render URL (e.g., `https://<service>.onrender.com`) — you should see the UI.
3) Upload a small PDF; watch progress; confirm artifacts exist on disk:
   - If using local storage, files live in `/app/data` (on the Render disk).
   - If using S3, check your bucket for uploads and outputs.
4) Health check: `https://<service>.onrender.com/healthz` should return `{"status": "ok"}`.

## Notes and options
- If the build fails due to memory, increase the instance size or add a swap build step (Render doesn’t support swap easily; upgrading instance is simpler).
- If you prefer S3 for artifacts (to keep the container stateless), switch `STORAGE_BACKEND=s3` and provide S3 creds; you can then drop the Render disk.
- For stricter CORS, set `CORS_ALLOW_ORIGINS` to your Render URL instead of `*`.
- Logs: view build and runtime logs in the Render dashboard.
- Deploys: each push to the tracked branch triggers a rebuild (if auto-deploy is on). You can also trigger manual deploys.
