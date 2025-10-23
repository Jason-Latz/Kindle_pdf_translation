'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { DownloadCard } from '../components/DownloadCard'
import { JobStatus, ProgressFeed } from '../components/ProgressFeed'
import { TargetLangSelect } from '../components/TargetLangSelect'
import { UploadBox } from '../components/UploadBox'

const POLL_INTERVAL_MS = 2000

export default function HomePage() {
  const [selectedLang, setSelectedLang] = useState('es')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isProcessing = useMemo(
    () =>
      jobStatus !== null &&
      !['done', 'error'].includes(jobStatus.status ?? '') &&
      !error,
    [jobStatus, error],
  )

  const handleFileSelected = useCallback((file: File) => {
    setSelectedFile(file)
    setError(null)
  }, [])

  const createJob = useCallback(async () => {
    if (!selectedFile) {
      setError('Please choose a PDF before starting the translation.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('tgt_lang', selectedLang)

      const response = await fetch('/api/jobs', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message = payload?.detail ?? 'Unable to start translation. Please try again.'
        throw new Error(message)
      }

      const payload = (await response.json()) as JobStatus
      setJobStatus(payload)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unexpected error starting translation.')
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedFile, selectedLang])

  useEffect(() => {
    if (!jobStatus?.job_id) return
    if (['done', 'error'].includes(jobStatus.status)) return

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobStatus.job_id}`)
        if (!response.ok) {
          throw new Error('Unable to refresh job status.')
        }
        const payload = (await response.json()) as JobStatus
        setJobStatus(payload)
      } catch (err) {
        console.error(err)
        setError('Something went wrong while tracking progress. Please refresh to continue.')
        clearInterval(interval)
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [jobStatus?.job_id, jobStatus?.status])

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 pb-16 pt-10">
      <header className="grid gap-8 rounded-3xl border border-slate-800/80 bg-slate-950/70 px-8 py-10 shadow-2xl shadow-sky-500/10 md:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-1 text-xs uppercase tracking-[0.35em] text-sky-300">
            <span className="h-2 w-2 rounded-full bg-sky-300" />
            Book Translator
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-slate-50 md:text-5xl">
            Turn any PDF into a bilingual reading experience.
          </h1>
          <p className="text-base text-slate-300 md:text-lg">
            Upload a book, choose your target language, and let our pipeline parse, translate, and package everything into a Kindle-ready EPUB and a study-ready flashcard deck.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-sm font-semibold text-slate-200">Smart translations</p>
              <p className="mt-2 text-sm text-slate-400">Powered by GPT-quality models tuned for long-form comprehension.</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-sm font-semibold text-slate-200">Study companions</p>
              <p className="mt-2 text-sm text-slate-400">Automatic flashcards give you the vocabulary recap for each chapter.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <TargetLangSelect value={selectedLang} onChange={setSelectedLang} disabled={isSubmitting || isProcessing} />
          <UploadBox
            onFileSelected={handleFileSelected}
            disabled={isSubmitting || isProcessing}
            selectedFileName={selectedFile?.name ?? null}
          />
          <button
            type="button"
            className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-2xl bg-sky-500 text-lg font-semibold text-slate-950 shadow-lg shadow-sky-500/30 transition focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            onClick={createJob}
            disabled={isSubmitting || !selectedFile || isProcessing}
          >
            <span className="absolute inset-0 -z-10 bg-gradient-to-r from-sky-400 via-cyan-400 to-sky-500 opacity-0 transition group-hover:opacity-100" />
            {isSubmitting ? 'Starting…' : isProcessing ? 'Processing…' : 'Translate my book'}
          </button>
          {error ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
          ) : null}
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ProgressFeed status={jobStatus} />
        <DownloadCard status={jobStatus} />
      </section>

      <section className="rounded-3xl border border-slate-800/80 bg-slate-950/70 px-8 py-10 text-sm text-slate-300">
        <h2 className="text-xl font-semibold text-slate-100">How it works</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            {
              title: '1. Parse your PDF',
              body: 'We analyze the layout, clean up repeated headers, and break the book into digestible paragraphs ready for translation.',
            },
            {
              title: '2. Translate with context',
              body: 'Paragraphs are translated in batches using context-aware prompts so tone and voice stay faithful to the original.',
            },
            {
              title: '3. Package and deliver',
              body: 'You receive an EPUB you can send to Kindle plus CSV flashcards that drop into any spaced-repetition app.',
            },
          ].map((step) => (
            <article key={step.title} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-base font-semibold text-slate-100">{step.title}</h3>
              <p className="text-sm text-slate-400">{step.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
