# Book Translator (Lean MVP)

This repository hosts a lean Book Translator MVP that ingests a text-based PDF, translates it into a supported language, produces a Kindle-ready EPUB, and generates flashcards. The current build favors simplicity: a single FastAPI process, SQLite (or JSON manifests) for state, and local or MinIO storage.

- **Backend:** FastAPI 0.11x, Pydantic v2, optional SQLAlchemy + SQLite.
- **Pipeline:** BackgroundTasks orchestrating `extract → translate → build_epub → flashcards`.
- **Storage:** Local filesystem by default; MinIO via S3-compatible API when desired.
- **Frontend:** Optional static/Next.js client for uploads and progress tracking.

Refer to `BOOK_TRANSLATOR_PROJECT.md` for the detailed milestone plan.

## Getting Started

1. `cp .env.example .env` and populate API keys or adjust storage/DB mode.
2. `make up` to start the backend (and MinIO if enabled).
3. Visit `http://localhost:8000/docs` to try the API.
4. Use `curl -F file=@sample.pdf -F tgt_lang=es http://localhost:8000/api/jobs` to kick off a translation.

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

The plan is structured so you can later swap SQLite → Postgres, local storage → AWS S3, and BackgroundTasks → Celery without rewriting the application.
