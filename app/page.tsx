'use client'

import { upload } from '@vercel/blob/client'
import { useEffect, useState } from 'react'

import { DownloadCard } from '@/components/DownloadCard'
import { ProgressFeed, type JobStatus } from '@/components/ProgressFeed'
import { TargetLangSelect } from '@/components/TargetLangSelect'
import { UploadBox } from '@/components/UploadBox'

const POLL_INTERVAL_MS = 2000

function buildUploadPath(filename: string): string {
  const safe = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
  return `source/${crypto.randomUUID()}-${safe || 'upload.pdf'}`
}

export default function HomePage() {
  const [selectedLang, setSelectedLang] = useState('es')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isProcessing =
    jobStatus !== null && !['done', 'error'].includes(jobStatus.status) && !error

  useEffect(() => {
    if (!jobStatus?.job_id || ['done', 'error'].includes(jobStatus.status)) {
      return
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobStatus.job_id}`)
        if (!response.ok) {
          throw new Error('Unable to refresh job status.')
        }
        const payload = (await response.json()) as JobStatus
        setJobStatus(payload)
      } catch (refreshError) {
        console.error(refreshError)
        setError('Something went wrong while tracking progress. Please refresh to continue.')
        window.clearInterval(interval)
      }
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [jobStatus?.job_id, jobStatus?.status])

  async function createJob() {
    if (!selectedFile) {
      setError('Please choose a PDF before starting the translation.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const blob = await upload(buildUploadPath(selectedFile.name), selectedFile, {
        access: 'private',
        handleUploadUrl: '/api/uploads/pdf',
      })

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourcePathname: blob.pathname,
          filename: selectedFile.name,
          sizeBytes: selectedFile.size,
          targetLang: selectedLang,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.detail ?? 'Unable to start translation. Please try again.')
      }

      const payload = (await response.json()) as JobStatus
      setJobStatus(payload)
    } catch (submitError) {
      console.error(submitError)
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unexpected error starting translation.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

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
            Upload a book, choose your target language, and let the pipeline parse,
            translate, and package everything into a Kindle-ready EPUB and a study-ready
            flashcard deck.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-sm font-semibold text-slate-200">Direct-to-Blob uploads</p>
              <p className="mt-2 text-sm text-slate-400">
                Large PDFs bypass function body limits and land in private storage first.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-sm font-semibold text-slate-200">Durable pipeline</p>
              <p className="mt-2 text-sm text-slate-400">
                Queue ingress and a workflow run keep long jobs reliable without a Python worker.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <TargetLangSelect
            value={selectedLang}
            onChange={setSelectedLang}
            disabled={isSubmitting || isProcessing}
          />
          <UploadBox
            onFileSelected={(file) => {
              setSelectedFile(file)
              setError(null)
            }}
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
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ProgressFeed status={jobStatus} />
        <DownloadCard status={jobStatus} />
      </section>
    </main>
  )
}
