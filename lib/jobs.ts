import postgres from 'postgres'

import { getConfig, requireDatabaseUrl } from '@/lib/config'
import type {
  JobRow,
  JobStage,
  JobStatus,
  TranslationProviderId,
} from '@/lib/types'

type JobInsert = {
  id: string
  filename: string
  sourceBlobPath: string
  targetLang: string
  provider: TranslationProviderId
}

type JobUpdate = {
  status?: JobStatus
  stage?: JobStage
  pct?: number
  error?: string | null
  workflowRunId?: string | null
  epubBlobPath?: string | null
  flashcardsBlobPath?: string | null
}

let client: postgres.Sql | null = null
let schemaPromise: Promise<void> | null = null

function getSql() {
  if (!client) {
    client = postgres(requireDatabaseUrl(), {
      max: 1,
      prepare: false,
    })
  }

  return client
}

function rowFromRecord(record: Record<string, unknown>): JobRow {
  return {
    id: String(record.id),
    filename: String(record.filename),
    source_blob_path: String(record.source_blob_path),
    target_lang: String(record.target_lang),
    provider: record.provider as TranslationProviderId,
    status: record.status as JobStatus,
    stage: record.stage as JobStage,
    pct: Number(record.pct),
    error: record.error === null ? null : String(record.error),
    workflow_run_id: record.workflow_run_id === null ? null : String(record.workflow_run_id),
    epub_blob_path: record.epub_blob_path === null ? null : String(record.epub_blob_path),
    flashcards_blob_path:
      record.flashcards_blob_path === null ? null : String(record.flashcards_blob_path),
    created_at: new Date(String(record.created_at)),
    updated_at: new Date(String(record.updated_at)),
  }
}

export async function ensureJobsTable(): Promise<void> {
  if (!schemaPromise) {
    const sql = getSql()
    schemaPromise = sql`
      create table if not exists jobs (
        id text primary key,
        filename text not null,
        source_blob_path text not null,
        target_lang text not null,
        provider text not null,
        status text not null,
        stage text not null,
        pct double precision not null default 0,
        error text,
        workflow_run_id text,
        epub_blob_path text,
        flashcards_blob_path text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `.then(() => undefined)
  }

  return schemaPromise
}

export async function createJobRecord(input: JobInsert): Promise<JobRow> {
  await ensureJobsTable()
  const sql = getSql()
  const [row] = await sql<Record<string, unknown>[]>`
    insert into jobs (
      id,
      filename,
      source_blob_path,
      target_lang,
      provider,
      status,
      stage,
      pct
    ) values (
      ${input.id},
      ${input.filename},
      ${input.sourceBlobPath},
      ${input.targetLang},
      ${input.provider},
      'queued',
      'queued',
      0
    )
    returning *
  `

  return rowFromRecord(row)
}

export async function getJobRecord(jobId: string): Promise<JobRow | null> {
  await ensureJobsTable()
  const sql = getSql()
  const [row] = await sql<Record<string, unknown>[]>`
    select * from jobs where id = ${jobId}
  `

  return row ? rowFromRecord(row) : null
}

export async function updateJobRecord(jobId: string, patch: JobUpdate): Promise<JobRow | null> {
  await ensureJobsTable()
  const sql = getSql()
  const current = await getJobRecord(jobId)
  if (!current) {
    return null
  }

  const [row] = await sql<Record<string, unknown>[]>`
    update jobs
    set
      status = ${patch.status !== undefined ? patch.status : current.status},
      stage = ${patch.stage !== undefined ? patch.stage : current.stage},
      pct = ${patch.pct !== undefined ? patch.pct : current.pct},
      error = ${patch.error !== undefined ? patch.error : current.error},
      workflow_run_id = ${
        patch.workflowRunId !== undefined ? patch.workflowRunId : current.workflow_run_id
      },
      epub_blob_path = ${
        patch.epubBlobPath !== undefined ? patch.epubBlobPath : current.epub_blob_path
      },
      flashcards_blob_path = ${
        patch.flashcardsBlobPath !== undefined
          ? patch.flashcardsBlobPath
          : current.flashcards_blob_path
      },
      updated_at = now()
    where id = ${jobId}
    returning *
  `

  return row ? rowFromRecord(row) : null
}

export async function markWorkflowStarting(jobId: string): Promise<JobRow | null> {
  await ensureJobsTable()
  const sql = getSql()
  const [row] = await sql<Record<string, unknown>[]>`
    update jobs
    set
      workflow_run_id = '__starting__',
      updated_at = now()
    where id = ${jobId}
      and workflow_run_id is null
    returning *
  `

  return row ? rowFromRecord(row) : null
}

export async function finalizeWorkflowRunId(jobId: string, runId: string): Promise<JobRow | null> {
  return updateJobRecord(jobId, { workflowRunId: runId })
}

export async function clearWorkflowRunId(jobId: string): Promise<JobRow | null> {
  return updateJobRecord(jobId, { workflowRunId: null })
}

export function getConfiguredProvider(): TranslationProviderId {
  return getConfig().translatorProvider
}
