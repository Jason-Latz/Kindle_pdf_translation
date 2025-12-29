# Book Translator (Lean MVP)

Turn any text-based PDF into a bilingual learning pack. This project parses a book, translates it into a supported language, exports a Kindle-ready EPUB, and generates a flashcard deck so you can reinforce new vocabulary as you read.

- **Backend:** FastAPI, Pydantic v2, optional SQLAlchemy + SQLite.
- **Pipeline:** `extract → translate → build_epub → flashcards` managed via FastAPI background tasks.
- **Storage:** Local filesystem by default; S3-compatible (MinIO/AWS) when configured.
- **Frontend:** Single-page Next.js UI for uploads, progress tracking, and artifact downloads.

Refer to `BOOK_TRANSLATOR_PROJECT.md` for the roadmap.

## How the Website Works

- **Upload & choose a language:** Drag a PDF (≤100 MB / 600 pages) onto the landing page and pick a target language.
- **Watch live progress:** The UI streams updates as the backend extracts text, translates chapters, assembles an EPUB, and builds flashcards.
- **Download artifacts:** When the job finishes you get two links—`book.epub` for Kindle Send-to-Device/AirDrop/USB transfer, and `flashcards.csv` for Anki or any SRS app.
- **Retry-friendly:** All jobs are idempotent; you can refresh the page or reopen the site later and use your job ID to re-download outputs.

## Why This Way of Learning Works

- **Dual coding:** Reading the source and translation together pairs verbal and visual cues, improving recall and comprehension (Paivio, 1990s lab findings on dual coding).
- **Retrieval practice:** Flashcards turn the translated text into low-friction recall reps, a technique shown to beat passive review in classroom studies (Roediger & Karpicke, 2006).
- **Spacing effects:** Exported decks can be scheduled with spaced-repetition algorithms, leveraging the Ebbinghaus forgetting-curve research to retain vocabulary longer.
- **Context-rich examples:** Long-form text preserves idioms and discourse markers that sentence-level flashcards often strip away, which helps learners internalize natural syntax.

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

## Manual Setup (Dev Workflow) — Run Frontend + Backend Locally

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

## Using the App (Step-by-Step)

1. Open http://localhost:3000.
2. Choose a target language and drag-and-drop a PDF (≤100 MB / 600 pages).
3. Watch the progress feed update for each pipeline stage.
4. When complete, download:
   - `book.epub` — the translated book, ready for Kindle Send-to-Device.
   - `flashcards.csv` — vocabulary pairs for spaced repetition apps.

If you trigger jobs directly via API, POST to `/api/jobs` with multipart form fields `file` and `tgt_lang`, then poll `/api/jobs/{id}` and download artifacts from `/api/jobs/{id}/download?file_type=epub|flashcards`.

### Tips for Kindle & Flashcards
- Send the `.epub` to Kindle via the Kindle app’s “Send to Kindle,” email-to-Kindle, or USB transfer; the file is optimized for current-generation devices.
- Import `flashcards.csv` into Anki (or similar) using “Field 1 → Front / Field 2 → Back.” Enable spaced repetition for best retention.
- If translation quality matters most, set `TRANSLATOR_PROVIDER=openai` with an API key; for a free demo keep `hf` to use the Hugging Face pipeline.

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
