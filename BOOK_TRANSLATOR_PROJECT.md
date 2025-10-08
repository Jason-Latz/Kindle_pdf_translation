# Book Translator & Flashcards — Project Blueprint

A production‑style MVP that ingests a **text‑based PDF** of a book, **translates** it from **English → {Spanish, French, German, Italian, Portuguese}**, generates **per‑chapter flashcards**, and outputs a **Kindle‑ready EPUB** plus a **CSV** of flashcards.

This document is optimized for dropping into your ChatGPT Project folder as the single source of truth for you (and any coding agent).

---

## 0) Goals and Non‑Goals

**Goals**
- Upload a text‑based PDF; no OCR in MVP.
- Parse and segment by **chapters** and **paragraphs**.
- Translate with **OpenAI API** (MVP) with a **pluggable** design for **Hugging Face** later.
- Generate **rarity‑scored flashcards** per chapter.
- Assemble a clean **EPUB** with TOC and metadata.
- Ship quickly with a modern, resume‑relevant stack.

**Non‑Goals (MVP)**
- OCR for scanned PDFs.
- Authentication / multi‑tenant accounts.
- DOCX/PDF export (EPUB only).

---

## 1) Tech Stack Summary

- **Frontend:** Next.js (React + TypeScript + TailwindCSS).  
- **Backend:** FastAPI (Python 3.11), Pydantic v2, Uvicorn.  
- **Workers:** Celery 5 + Redis broker (background stages).  
- **DB:** PostgreSQL 15 + SQLAlchemy 2 + Alembic (migrations).  
- **Storage:** MinIO locally, **S3** in production.  
- **Parsing:** PyMuPDF (fitz).  
- **NLP:** spaCy models (es, fr, de, it, pt), `wordfreq`, TF‑IDF (scikit‑learn).  
- **Translation (MVP):** OpenAI `gpt-4o-mini` (configurable).  
- **EPUB:** `ebooklib` + Jinja2 XHTML templates.  
- **Containerization:** Docker + Docker Compose.  
- **Deployment target:** AWS ECS Fargate or Fly.io (post‑MVP).

---

## 2) Guardrails & Limits

Set as environment variables in `backend/.env`:

```
MAX_UPLOAD_MB=100
MAX_PAGES=600
MAX_CHARACTERS=1200000
MAX_PARAGRAPHS=50000
MAX_CHAPTERS=200
SUPPORTED_TGT_LANGS=es,fr,de,it,pt
DEFAULT_SRC_LANG=en
DEFAULT_TGT_LANG=es
```

**Validation rules**
- Reject encrypted PDFs, PDFs with embedded JS, or **image‑only** PDFs (add OCR later).  
- Count total characters pre‑translation; abort over `MAX_CHARACTERS`.  
- **Deduplicate** paragraph translations by SHA‑1 to avoid re‑billing.

---

## 3) Repository Layout

```
book-translator/
  README.md
  infra/
    docker-compose.yml
    Dockerfile.backend
    Dockerfile.frontend
  frontend/
    package.json
    tsconfig.json
    next.config.js
    postcss.config.js
    tailwind.config.js
    styles/globals.css
    app/
      page.tsx
      job/[id]/page.tsx
    components/
      UploadBox.tsx
      TargetLangSelect.tsx
      ProgressFeed.tsx
      DownloadCard.tsx
    lib/
      api.ts
      sse.ts
  backend/
    pyproject.toml
    requirements.txt
    .env.example
    .env                 # (local copy; NOT committed)
    alembic/
      env.py
      script.py.mako
      versions/
    app/
      main.py
      config.py
      deps.py
      db/
        models.py
        session.py
        crud.py
      routers/
        books.py
        events.py
      services/
        storage.py
        epub.py
        flashcards.py
        normalize.py
        chaptering.py
        translation/
          base.py
          openai_provider.py
          # hf_provider.py (post‑MVP)
      workers/
        celery_app.py
        tasks.py
        stages/
          parse_pdf.py
          detect_chapters.py
          extract_paragraphs.py
          translate.py
          assemble_epub.py
          build_flashcards.py
          finalize.py
```

---

## 4) Environment & Secrets

`backend/.env.example` (copy to `.env` and fill `OPENAI_API_KEY`):

```
APP_ENV=dev
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/books
REDIS_URL=redis://redis:6379/0

S3_ENDPOINT_URL=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=book-translator
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

OPENAI_API_KEY=replace_me
OPENAI_MODEL=gpt-4o-mini

# Limits
MAX_UPLOAD_MB=100
MAX_PAGES=600
MAX_CHARACTERS=1200000
MAX_PARAGRAPHS=50000
MAX_CHAPTERS=200

# Languages
SUPPORTED_TGT_LANGS=es,fr,de,it,pt
DEFAULT_SRC_LANG=en
DEFAULT_TGT_LANG=es
```

Frontend `.env.local` (if needed):
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

---

## 5) Core API & Flows

**Endpoints**
- `POST /api/books` → create book, return **signed PUT URL** + `book_id`.
- PUT file to signed URL (direct to MinIO/S3).
- `POST /api/books/{id}/upload-complete` → enqueue pipeline; status = `UPLOADED`.
- `GET /api/books/{id}` → status, files (EPUB, CSV).
- `GET /api/books/{id}/events` → **SSE** progress stream (`{stage, pct, detail}`).

**Stages**
`UPLOADED → PARSED → CHAPTERED → EXTRACTED → TRANSLATING → ASSEMBLING → FLASHCARDS → COMPLETE`

---

## 6) Worker Pipeline (Celery)

1. **parse_pdf**: PyMuPDF extract, reject encrypted/image‑only, write `artifacts/pages.json`.  
2. **detect_chapters**: heuristics (font size spikes, “Chapter …”, roman numerals), write `chapters`.  
3. **extract_paragraphs**: merge lines, fix hyphenation, strip headers/footers, compute `sha1`, enforce limits, write `paragraphs`.  
4. **translate**: batch by token estimate, prompt OpenAI (temperature 0), save `translations` (dedupe by `(paragraph_id, engine, tgt_lang)`).  
5. **assemble_epub**: render XHTML with Jinja2, build EPUB via `ebooklib`, set `dc:language = lang_tgt`, upload file.  
6. **build_flashcards**: spaCy tokenize/lemma/POS, TF‑IDF + `wordfreq` Zipf rarity; per lemma call OpenAI for **short definition** and **one example sentence** grounded in book context; write `flashcards.csv`.  
7. **finalize**: status → COMPLETE.

**Progress updates**: each stage writes to `jobs` table; SSE polls or uses Redis pub/sub for push.

---

## 7) Translation Provider Interface

```python
# app/services/translation/base.py
from typing import List

class Translator:
    async def translate_batch(self, texts: List[str], src: str, tgt: str) -> List[str]:
        raise NotImplementedError
```

**OpenAI provider (MVP)**: `openai_provider.py` implements `translate_batch`.  
**Hugging Face provider (later)**: `hf_provider.py` loads NLLB/M2M100 on **Apple Silicon (MPS)**.

---

## 8) Flashcards — Scoring & Content

- **Filter**: stopwords, numbers, named entities; optionally down‑weight proper nouns.  
- **Score**: `score = 0.7*(maxZipf - Zipf(token, lang)) + 0.3*TFIDF(token, chapter)`; small POS boosts for NOUN/VERB/ADJ.  
- **Select**: top **N=20** per chapter (configurable).  
- **Generate content**: OpenAI returns **definition** (in target language) and **one example** sentence (preferably sourced or paraphrased from the chapter).  
- **Export**: `flashcards.csv` columns → `chapter_idx, word, lemma, pos, rarity_score, definition, example`.

---

## 9) Frontend UX

- **Upload page**: file picker + **Target Language** dropdown. POST `/api/books` → PUT to signed URL → POST `upload-complete` → redirect to job page.  
- **Job page**: open SSE, show stage/pct, when COMPLETE show **Download** buttons (EPUB, CSV).  
- **Errors**: clear messages for size, pages, characters, encryption, image‑only PDFs.

---

## 10) Local Dev — One‑Command Bring‑Up

From repo root:

```bash
docker compose -f infra/docker-compose.yml up --build
```
Then run initial migration (inside backend container):
```bash
alembic upgrade head
```

Visit:  
- API docs → http://localhost:8000/docs  
- Frontend → http://localhost:3000

---

## 11) Minimal Dependency Lists

**backend/requirements.txt**
```
fastapi>=0.115
uvicorn[standard]
pydantic>=2.7
sqlalchemy>=2.0
psycopg[binary]
alembic
boto3
minio
celery[redis]
redis
pymupdf
jinja2
ebooklib
spacy
wordfreq
scikit-learn
httpx
python-dotenv
openai>=1.40
```

**frontend/package.json (key deps)**
```json
{
  "dependencies": {
    "next": "14.x",
    "react": "18.x",
    "react-dom": "18.x",
    "typescript": "^5",
    "tailwindcss": "^3",
    "autoprefixer": "^10",
    "postcss": "^8",
    "axios": "^1"
  }
}
```

---

## 12) Acceptance Criteria (MVP)

- Upload a valid text‑PDF under **100 MB** and **600 pages**.  
- Choose **es/fr/de/it/pt**; pipeline runs through all stages.  
- Output **EPUB** opens in Kindle/Apple Books with a working TOC; text is fully translated.  
- **flashcards.csv** contains **10–30** sensible rare terms per chapter with definitions and examples in the target language.  
- Re‑runs are **idempotent** (no duplicate rows, no re‑billing).  
- Limits and errors surface clearly to the user.

---

## 13) Stretch Goals (Post‑MVP)

- **Hugging Face** provider (NLLB/M2M100) on Apple Silicon (MPS).  
- OCR fallback (Tesseract) for scanned PDFs.  
- Anki `.apkg` export (`genanki`).  
- AWS ECS Fargate deployment; S3 in production; GitHub Actions CI.  
- Glossary rules and constrained decoding for terminology fidelity.

---

## 14) Folder Setup Instructions (ChatGPT Project)

1. Create a **ChatGPT Project** named `book-translator`.  
2. Add this file as `BOOK_TRANSLATOR_PROJECT.md` at the repo root.  
3. Create subfolders exactly as shown in **Repository Layout**.  
4. Place Docker files under `infra/` and copy the env templates.  
5. Implement backend first (models → storage → routers → workers → stages), then frontend (upload + job pages).  
6. Use this doc as the **authoritative task list** for your coding agent; work top‑to‑bottom by sections 4 → 11.  

---

## 15) Interview Talking Points (Hugging Face angle)

- **Pluggable translator** interface; OpenAI (MVP) + **HF NLLB/M2M100** local path.  
- **Length bucketing + dynamic batching** to maximize MPS throughput.  
- **Glossary preservation** via sentinel masking, numeric & punctuation integrity checks.  
- **Quality checks** with chrF/COMET on a small canary set (post‑MVP).

---

## 16) Quick Start Checklist

- [ ] `docker compose up` starts Postgres, Redis, MinIO, FastAPI, Celery worker, Next.js.  
- [ ] `alembic upgrade head` creates tables.  
- [ ] Upload a small sample PDF → see progress events.  
- [ ] Download EPUB and CSV; open and verify.  
- [ ] Re‑run same PDF → no double charges, no duplicate rows.

---

**End of document.**