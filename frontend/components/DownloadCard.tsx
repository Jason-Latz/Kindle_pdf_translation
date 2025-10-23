'use client'

import { JobStatus } from './ProgressFeed'

type DownloadCardProps = {
  status: JobStatus | null
}

export function DownloadCard({ status }: DownloadCardProps) {
  const isReady = status?.status === 'done'
  const jobId = status?.job_id

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Outputs</p>
          <h3 className="text-lg font-semibold text-slate-50">Your translated assets</h3>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
          }`}
        >
          {isReady ? 'Ready' : 'Waiting'}
        </span>
      </div>

      <p className="mb-6 text-sm text-slate-300">
        Once processing finishes, download the EPUB version of your book and the flashcards CSV for spaced-repetition review.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <DownloadButton
          label="Download EPUB"
          href={jobId ? `/api/jobs/${jobId}/download?type=epub` : '#'}
          ready={isReady}
        />
        <DownloadButton
          label="Download Flashcards"
          href={jobId ? `/api/jobs/${jobId}/download?type=flashcards` : '#'}
          ready={isReady}
        />
      </div>
      {!isReady && (
        <p className="mt-4 text-xs text-slate-500">
          Links unlock automatically once the translation pipeline completes.
        </p>
      )}
    </div>
  )
}

type DownloadButtonProps = {
  label: string
  href: string
  ready: boolean
}

function DownloadButton({ label, href, ready }: DownloadButtonProps) {
  return (
    <a
      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
        ready
          ? 'border-emerald-400/60 bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400'
          : 'cursor-not-allowed border-slate-800 bg-slate-900/80 text-slate-500'
      }`}
      href={ready ? href : '#'}
      aria-disabled={!ready}
      onClick={(event) => {
        if (!ready) {
          event.preventDefault()
        }
      }}
    >
      {label}
    </a>
  )
}
