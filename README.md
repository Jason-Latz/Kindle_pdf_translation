# Book Translator (Lean MVP)

Turn any text-based PDF into a bilingual learning pack. This project parses a book, translates it into a supported language, exports a Kindle-ready EPUB, and generates a flashcard deck so you can reinforce new vocabulary as you read.

- **Backend:** FastAPI, Pydantic v2, optional SQLAlchemy + SQLite.
- **Pipeline:** `extract → translate → build_epub → flashcards` managed via FastAPI background tasks.
- **Storage:** Local filesystem by default; S3-compatible (MinIO/AWS) when configured.
- **Frontend:** Single-page Next.js UI for uploads, progress tracking, and artifact downloads.

Refer to `BOOK_TRANSLATOR_PROJECT.md` for the roadmap.

## Learning Benefits

- Read the original and translated text together to internalize grammar and tone.
- Export an EPUB you can send to Kindle for immersive reading on hardware you already use.
- Generate a CSV flashcard deck for Anki or other SRS tools so you can drill the vocabulary that matters.
- Track the pipeline stages to see how long-form content is processed end-to-end.

## Quick Start (Docker Compose)

Prerequisites: Docker Engine + Docker Compose plugin.

1. **Copy environment defaults**
   ```bash
   cp .env.example .env
   ```
   - For a no-API-key demo set `TRANSLATOR_PROVIDER=hf`.
   - Add `OPENAI_API_KEY` if you want real translations via OpenAI.
2. **Build and run**
   ```bash
   docker compose -f infra/docker-compose.yml up --build
   ```
   - Services: `backend` (FastAPI), `frontend` (Next.js), `minio` (S3-compatible storage, optional).
3. **Visit**
   - Frontend: http://localhost:3000
   - API docs: http://localhost:8000/docs

Stop everything with:
```bash
docker compose -f infra/docker-compose.yml down
```

## Manual Setup (Dev Workflow)

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env  # if you have not already
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

For local development, ensure the frontend can reach the backend by keeping `NEXT_PUBLIC_API_BASE=http://localhost:8000`. The Next.js config includes a rewrite so `/api/*` calls are proxied correctly.

## Using the App

1. Open http://localhost:3000.
2. Choose a target language and drag-and-drop a PDF (≤100 MB / 600 pages).
3. Watch the progress feed update for each pipeline stage.
4. When complete, download:
   - `book.epub` — the translated book, ready for Kindle Send-to-Device.
   - `flashcards.csv` — vocabulary pairs for spaced repetition apps.

If you trigger jobs directly via API, POST to `/api/jobs` with multipart form fields `file` and `tgt_lang`, then poll `/api/jobs/{id}` and download artifacts from `/api/jobs/{id}/download?file_type=epub|flashcards`.

## Make Targets

- `make up` — build and run the dockerized backend (plus MinIO).
- `make down` — stop containers.
- `make logs` — tail backend logs.
- `make sh.backend` — open a shell inside the backend container.

## Repository Layout

```
backend/             # FastAPI app, pipeline modules, providers
data/                # Uploads, artifacts, sqlite db, manifests
infra/               # docker-compose.yml and infra tooling
objectdata/          # MinIO data (optional)
```
