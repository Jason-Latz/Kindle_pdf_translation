# LinkedIn launch post — DRAFTS

> ⚠️ **DRAFT ONLY — DO NOT POST.** Awaiting Jason's review/edits. Pick one variant
> (or remix), add a screenshot/GIF of the app + a chaptered EPUB on a Kindle, and
> drop in the live URL before publishing.

---

## Variant A — builder / engineering angle

I built a tool that turns any text PDF into a **translated, Kindle-ready EPUB** —
plus a deck of study flashcards from the book's own vocabulary. 📚→🌍

The fun part was the engineering. It's fully serverless on Vercel:

• Upload goes **straight to private blob storage** (no file ever passes through a
function body, so big books don't hit request limits)
• A **queue** accepts the job in milliseconds and hands it to a **durable Vercel
Workflow** — parse → translate → build EPUB → generate flashcards → finalize
• Because the pipeline is durable, a crash or timeout mid-book **resumes from the
last completed step** instead of re-running (and re-paying for) everything
• Translation streams through the OpenAI API in token-budgeted batches
• Chapter detection (font-size + heading heuristics) produces a **real navigable
table of contents**, not one giant wall of text
• Flashcards pick the highest-value vocabulary and attach a **context sentence**
from the book so each card teaches the word in use

No always-on server, no Python worker — just functions, a queue, and a workflow.

Try it: [link] · Stack: Next.js 15 · Vercel Blob/Queues/Workflow · Postgres · OpenAI

---

## Variant B — reader / product angle

Ever found the perfect book… in a language you're still learning?

I made a little web app for exactly that. Drop in a PDF, pick a language, and a few
minutes later you get:

📖 a **translated EPUB** you can send straight to your Kindle — with chapters and a
working table of contents
🃏 a **flashcard deck** built from the book's most useful words, each with a real
sentence from the text for context

So you can read the book *and* study its vocabulary, from one upload.

Under the hood it's a serverless pipeline (Vercel Workflow + queues) that parses,
translates, and packages everything in the background while you watch the progress
bar — no account, no install.

Built with Next.js + OpenAI. Link in comments 👇

---

## Variant C — short hook

PDF in. Translated Kindle book + vocabulary flashcards out. 🪄

I built a serverless pipeline that takes any text PDF, translates it on the fly,
and packages it into a chaptered EPUB (with a real TOC) plus context-rich study
flashcards — all through a durable Vercel Workflow, so even a 600-page book that
times out just resumes where it left off.

Next.js 15 · Vercel Blob/Queues/Workflow · OpenAI. Demo 👇

---

## Notes for Jason (remove before posting)
- Verify the live URL and add it. Confirm the OpenAI cost story you're comfortable
  stating publicly (the app is currently public/unauthenticated — see
  `docs/security.md`; consider rate-limiting before a big launch).
- Good visuals: the upload UI, the live progress feed, and a chaptered EPUB opened
  on a Kindle / Apple Books showing the TOC. A short screen-capture GIF performs well.
- The HF provider is experimental; the public story should center on the OpenAI path.
