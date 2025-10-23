'use client'

import { useMemo } from 'react'

export type JobStatus = {
  job_id: string
  status: string
  stage: string
  pct: number
  error?: string | null
}

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  parse_pdf: 'Parsing PDF',
  translate: 'Translating',
  build_epub: 'Building EPUB',
  flashcards: 'Generating Flashcards',
  finalize: 'Finalizing',
  done: 'Completed',
  error: 'Error',
}

export function ProgressFeed({ status }: { status: JobStatus | null }) {
  const stages = useMemo(() => {
    return ['queued', 'parse_pdf', 'translate', 'build_epub', 'flashcards', 'finalize', 'done']
  }, [])

  if (!status) {
    return (
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 text-sm text-slate-300">
        Upload a PDF to see live pipeline updates.
      </div>
    )
  }

  const currentStageIndex = stages.findIndex((stage) => stage === status.stage)
  const isComplete = status.status === 'done'
  const isError = status.status === 'error'

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Pipeline progress</p>
          <h3 className="text-lg font-semibold text-slate-50">{STAGE_LABELS[status.stage] ?? status.stage}</h3>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isError
              ? 'bg-rose-500/20 text-rose-300'
              : isComplete
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-sky-500/20 text-sky-300'
          }`}
        >
          {isError ? 'Error' : isComplete ? 'Done' : 'In progress'}
        </span>
      </div>

      <div className="h-3 w-full rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isError
              ? 'bg-rose-500'
              : isComplete
                ? 'bg-emerald-500'
                : 'bg-sky-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, Math.round(status.pct))) || 0}%` }}
        />
      </div>
      <p className="text-xs text-slate-400">{Math.round(status.pct)}% complete</p>

      <ol className="space-y-3 text-sm">
        {stages.map((stage, index) => {
          const stageLabel = STAGE_LABELS[stage] ?? stage
          const stageComplete = index < currentStageIndex || (stage === status.stage && isComplete)
          const stageActive = stage === status.stage && !isComplete && !isError

          return (
            <li
              key={stage}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                stageComplete
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : stageActive
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                    : 'border-transparent bg-slate-900/50 text-slate-400'
              }`}
            >
              <span className="font-medium">{stageLabel}</span>
              {stageComplete ? (
                <span className="text-xs uppercase tracking-wide text-emerald-300">Done</span>
              ) : stageActive ? (
                <span className="text-xs uppercase tracking-wide text-sky-300">Active</span>
              ) : (
                <span className="text-xs uppercase tracking-wide text-slate-500">Waiting</span>
              )}
            </li>
          )
        })}
      </ol>

      {isError && status.error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {status.error}
        </div>
      ) : null}
    </div>
  )
}
