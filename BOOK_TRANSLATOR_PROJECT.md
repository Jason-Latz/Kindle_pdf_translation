# Book Translator — Lean Build Plan

This is a pragmatic, end-to-end roadmap for the Book Translator MVP. It removes Celery/Redis, avoids AWS services for now, and defers Postgres. You still build the same core features with a simplified stack: FastAPI, SQLite (or JSON manifests), and local or MinIO storage.

> **Build order:** Infra → Backend → Pipeline → (Optional) Frontend → Tests/Polish  
> **Strategy:** Ship fast with a single-process FastAPI app that uses `BackgroundTasks`. Later, swap in Postgres/Redis/S3 with minimal changes.

---

## Milestone 0 — Bootstrap the Repo & Containers

### Implement

- Create folders per the layout below.
- Add `infra/docker-compose.yml` with services: `backend` and optional `minio`.
- Copy `.env.example` to `.env` and fill keys (OpenAI, storage mode).
- Add a backend `Dockerfile`; mount volumes for hot reload while developing.
- Add Make targets: `make up`, `make down`, `make logs`, `make sh.backend`.

### Repo Layout

```
book-translator/
  backend/
    app/
      main.py
      routes.py
      config.py
      db.py                 # SQLite or JSON manifests
      models.py             # Minimal Job table if using SQLite
      pipeline/             # extract.py, translate.py, build_epub.py, flashcards.py
      providers/            # base.py, openai_provider.py, hf_stub_provider.py
      storage/              # local.py, s3_compat.py
      utils/                # ids.py, logging.py, locks.py
    tests/
    Dockerfile
    pyproject.toml (or requirements.txt)
  infra/
    docker-compose.yml
  data/                     # uploads, artifacts, manifests, db file
  objectdata/               # MinIO object store (if enabled)
  .github/workflows/ci.yml
  .env.example
  README.md
```

### `infra/docker-compose.yml`

```yaml
version: "3.9"
services:
  backend:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    env_file: ./.env
    volumes:
      - ./backend:/app
      - ./data:/data
    ports:
      - "8000:8000"
    depends_on:
      - minio

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    volumes:
      - ./objectdata:/data
    ports:
      - "9000:9000"
      - "9001:9001"
```

> If you want zero S3 right now, comment out the `minio` service and set `STORAGE_BACKEND=local`.

### `.env.example`

```dotenv
# Provider
TRANSLATOR_PROVIDER=openai          # or hf
OPENAI_API_KEY=sk-...

# Storage
STORAGE_BACKEND=local               # local | s3
S3_ENDPOINT=http://minio:9000       # MinIO in dev; leave empty for AWS later
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio123
S3_BUCKET=book-translator

# DB
DB_MODE=sqlite                      # sqlite | manifests
DB_URL=sqlite+aiosqlite:///./data/app.db

# App limits
MAX_PDF_MB=100
MAX_PAGES=600
TARGET_LANGS=es,fr,de,it,pt
```

### Prove It Works

- `docker compose up -d` → backend healthy.
- Visit `http://localhost:9001` (MinIO) if enabled.
- `GET /healthz` returns 200.

---

## Milestone 1 — FastAPI Skeleton, Settings, and DB/Manifests

### Implement

- `main.py`: create `FastAPI()` with CORS and `/healthz`.
- `config.py`: Pydantic Settings for OpenAI, storage mode, and limits.
- Choose SQLite (simpler) or JSON manifests:
  - SQLite: `db.py`, `models.py` define a `Job` table (fields: `id`, `filename`, `tgt_lang`, `status`, `pct`, `stage`, `error`, `created_at`, `epub_path`, `cards_path`).
  - Manifests: store per-job JSON at `data/manifests/{job_id}.json`.

### Prove It Works

- `GET /healthz` returns 200.
- SQLite file (`./data/app.db`) or manifests folder created.

---

## Milestone 2 — Storage Service + Upload Flow

### Implement

- `storage/local.py`
  - `save_upload(file, dst_path)` → saves to `./data/uploads/{job_id}/source.pdf`.
  - `open_artifact(path)` → stream file from disk.
- `storage/s3_compat.py`
  - `boto3.client()` with `endpoint_url=S3_ENDPOINT` (MinIO).
  - Wrap `put_object` / `get_object` helpers.
- Endpoints
  - `POST /api/jobs` (multipart form: file + `tgt_lang`)
    - Create `job_id`.
    - Save file (local or S3-compatible).
    - Enqueue background pipeline (next milestone).
    - Return `{job_id, status: "queued"}`.
  - `GET /api/jobs/{id}` → return job status (from DB or manifest).
  - `GET /api/jobs/{id}/download?type=epub|flashcards` → stream artifact.

### Prove It Works

- Upload a small PDF via `curl` or Swagger UI.
- File saved under `./data/uploads/...`; job record or manifest exists.

---

## Milestone 3 — Background Pipeline & Progress

### Implement

- Use FastAPI `BackgroundTasks` to kick off `run_pipeline(job_id)`.
- Pipeline stages:
  1. `parse_pdf` → `stage="parse_pdf"`, `pct≈10`
  2. `translate` → `stage="translate"`, update progress
  3. `build_epub` → `stage="build_epub"`, `pct≈90`
  4. `flashcards` → `stage="flashcards"`, `pct≈98`
  5. `finalize` → `status="done"`, `pct=100`
- Write progress to SQLite (or manifest JSON).
- Optional SSE endpoint `/api/jobs/{id}/events`; otherwise poll `GET /api/jobs/{id}`.

### Prove It Works

- Start a job; `GET /api/jobs/{id}` shows stage/pct updating until `done`.
- Log file `data/logs/{job_id}.log` records messages.

---

## Milestone 4 — PDF Parsing

### Implement

- `pipeline/extract.py` using PyMuPDF or `pdfminer.six`:
  - Validate limits (size, pages).
  - Reject encrypted/image-only PDFs.
  - Extract text blocks; normalize whitespace; merge lines; dehyphenate.
  - Strip repeated headers/footers; chunk into paragraphs.
- Save paragraph JSON at `./data/artifacts/{job_id}/paragraphs.json`.

### Prove It Works

- For a sample PDF, paragraphs JSON looks sane (counts match, clean text).

---

## Milestone 5 — Translation Provider (OpenAI MVP)

### Implement

- `providers/base.py`: defines `translate_batch(texts, src, tgt) -> list[str]`.
- `providers/openai_provider.py`: batch paragraphs by tokens, call OpenAI.
- `providers/hf_stub_provider.py`: mock responses (Apple Silicon stub).
- `pipeline/translate.py`: iterate paragraphs, translate, retry on rate limits.

### Prove It Works

- End-to-end run on short PDF; translated paragraph count equals source count.

---

## Milestone 6 — EPUB Assembly

### Implement

- `pipeline/build_epub.py` using `ebooklib`:
  - Build a simple EPUB with one or more chapters.
  - Add metadata (title, language).
  - Save to:
    - `./data/artifacts/{job_id}/book.epub` for local storage, or
    - `artifacts/{job_id}/book.epub` in MinIO when `STORAGE_BACKEND=s3`.

### Prove It Works

- EPUB opens in Apple Books/Calibre; content is translated.

---

## Milestone 7 — Flashcards CSV

### Implement

- Add spaCy tokenizer support (install `spacy>=3.7`; optionally download `python -m spacy download xx_sent_ud_sm` or language-specific models for better lemmatisation).
- `pipeline/flashcards.py`:
  - Tokenize translated text (spaCy or simple split).
  - Rank words by frequency × rarity (`wordfreq.zipf_frequency`).
  - Select top N per chapter; call OpenAI for definition + example.
  - Write `flashcards.csv` at `./data/artifacts/{job_id}/`.
- Update job status.

### Prove It Works

- `flashcards.csv` contains 10–30 reasonable entries with definitions.

---

## Milestone 8 — Minimal Frontend (Optional)

### Implement

- Static `index.html` under `/` or a simple Next.js page:
  - File picker, target-language dropdown.
  - POST to `/api/jobs`; poll `/api/jobs/{id}` for progress.
  - Display download links when done.

### Prove It Works

- Upload → translate → download — all through browser.

---

## Milestone 9 — Tests, CI, and Public URL

### Implement

- Tests: small unit tests + one end-to-end sample PDF.
- CI: `.github/workflows/ci.yml` runs lint, pytest, docker build.
- Public URL:
  - Instant: Cloudflare Tunnel or ngrok.
  - Stable: Deploy Docker container to Fly.io or Render.

### Prove It Works

- CI passes; pytest green; live URL serves `/docs`.

---

## Acceptance Checklist

- [ ] Upload valid text PDF (<100 MB, <600 pages).
- [ ] Pipeline runs parse → translate → EPUB → flashcards.
- [ ] Progress visible via `/api/jobs/{id}` or SSE.
- [ ] EPUB and CSV downloadable and valid.
- [ ] Clear errors for invalid PDFs or limits.

---

## Future Upgrades (Swap-In Ready)

| Feature         | Current                 | Later Upgrade             |
| --------------- | ----------------------- | ------------------------- |
| Database        | SQLite or manifests     | Postgres (via DB_URL env) |
| Storage         | Local or MinIO          | AWS S3                    |
| Background jobs | BackgroundTasks         | Celery + Redis            |
| Deployment      | Local / Fly.io / Render | AWS ECS Fargate           |

Typical upgrade time per component:

- Postgres: 30–60 min (no data) / 1–3 h (with migration).
- AWS S3: ~30 min (switch endpoint + creds).
- ECS deploy: 3–6 h initial setup.

---

## Command Reference

```bash
make up            # start backend (+ minio if enabled)
make down          # stop containers
make logs          # tail backend logs

# Start a job
curl -F file=@sample.pdf -F tgt_lang=es http://localhost:8000/api/jobs

# Check status
curl http://localhost:8000/api/jobs/<id>

# Share a public URL quickly (pick one)
cloudflared tunnel --url http://localhost:8000
# or
ngrok http 8000

# Run tests
pytest -q
```

---

## Working Style — Pair with AI

1. State the goal (e.g., “implement `/api/jobs` upload endpoint”).
2. Paste the relevant files and ask for minimal diffs.
3. Run immediately; share the first traceback.
4. Iterate until green, then commit.

Prompt template:

```
Goal: implement <small feature>.
Context: <relevant files>.
Constraints: minimal changes, FastAPI BackgroundTasks, Pydantic v2, SQLAlchemy 2 (if using SQLite).
Deliver: unified diff or exact file contents.
```

---

Happy shipping!
