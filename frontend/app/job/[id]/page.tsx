'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

import { DownloadCard } from '../../../components/DownloadCard'
import { JobStatus, ProgressFeed } from '../../../components/ProgressFeed'

const POLL_INTERVAL_MS = 2000

export default function JobStatusPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const jobId = useMemo(() => params?.id ?? searchParams?.get('id') ?? '', [params?.id, searchParams])

  const [status, setStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId) {
      setError('Missing job identifier.')
      return
    }

    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    async function loadStatus() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`)
        if (!response.ok) {
          throw new Error(`Could not load job ${jobId}.`)
        }
        const payload = (await response.json()) as JobStatus
        if (!cancelled) {
          setStatus(payload)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Unable to fetch job status. Please try again later.')
        }
      }
    }

    loadStatus()
    interval = setInterval(loadStatus, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [jobId])

  const heading = status?.status === 'done' ? 'Translation complete' : 'Tracking translation'

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 pb-16 pt-10">
      <header className="rounded-3xl border border-slate-800/80 bg-slate-950/70 px-8 py-10 shadow-2xl shadow-sky-500/10">
        <div className="flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-1 text-xs uppercase tracking-[0.35em] text-sky-300">
            <span className="h-2 w-2 rounded-full bg-sky-300" />
            Job Status
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-slate-50">{heading}</h1>
          <p className="text-base text-slate-300 md:text-lg">
            Monitoring job <span className="font-semibold text-sky-200">{jobId}</span>. Refreshing every few seconds—downloads unlock once the pipeline finishes.
          </p>
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
          >
            ← Back to uploader
          </Link>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-5 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ProgressFeed status={status} />
        <DownloadCard status={status} />
      </section>
    </main>
  )
}
