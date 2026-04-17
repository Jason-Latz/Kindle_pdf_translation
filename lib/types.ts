export const JOB_STATUSES = ['queued', 'processing', 'done', 'error'] as const
export const JOB_STAGES = [
  'queued',
  'parse_pdf',
  'translate',
  'build_epub',
  'flashcards',
  'finalize',
  'done',
  'error',
] as const
export const DOWNLOAD_FILE_TYPES = ['epub', 'flashcards'] as const

export type JobStatus = (typeof JOB_STATUSES)[number]
export type JobStage = (typeof JOB_STAGES)[number]
export type DownloadFileType = (typeof DOWNLOAD_FILE_TYPES)[number]
export type TranslationProviderId = 'openai' | 'hf'

export type JobStatusResponse = {
  job_id: string
  status: JobStatus
  stage: JobStage
  pct: number
  error: string | null
}

export type CreateJobRequest = {
  sourcePathname: string
  filename: string
  sizeBytes: number
  targetLang: string
}

export type JobRow = {
  id: string
  filename: string
  source_blob_path: string
  target_lang: string
  provider: TranslationProviderId
  status: JobStatus
  stage: JobStage
  pct: number
  error: string | null
  workflow_run_id: string | null
  epub_blob_path: string | null
  flashcards_blob_path: string | null
  created_at: Date
  updated_at: Date
}

export type QueueJobCreatedMessage = {
  type: 'job.created'
  jobId: string
}

export type ExtractedBook = {
  paragraphs: string[]
  pageCount: number
  title: string
  author: string
}

export type TranslatedBook = {
  paragraphs: string[]
}

export function toJobStatusResponse(row: JobRow): JobStatusResponse {
  return {
    job_id: row.id,
    status: row.status,
    stage: row.stage,
    pct: row.pct,
    error: row.error,
  }
}
