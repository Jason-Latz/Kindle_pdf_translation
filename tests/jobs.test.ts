import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type JobRecord = {
  id: string
  filename: string
  source_blob_path: string
  target_lang: string
  provider: string
  status: string
  stage: string
  pct: number
  error: string | null
  workflow_run_id: string | null
  epub_blob_path: string | null
  flashcards_blob_path: string | null
  created_at: Date
  updated_at: Date
}

const state = {
  queries: [] as string[],
  rows: new Map<string, JobRecord>(),
}

function normalizeQuery(strings: TemplateStringsArray) {
  return strings.join('?').replace(/\s+/g, ' ').trim()
}

function sqlStub(strings: TemplateStringsArray, ...values: unknown[]) {
  const query = normalizeQuery(strings)
  state.queries.push(query)

  if (query.startsWith('create table if not exists jobs')) {
    return Promise.resolve([])
  }

  if (query.startsWith('insert into jobs')) {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const row: JobRecord = {
      id: String(values[0]),
      filename: String(values[1]),
      source_blob_path: String(values[2]),
      target_lang: String(values[3]),
      provider: String(values[4]),
      status: 'queued',
      stage: 'queued',
      pct: 0,
      error: null,
      workflow_run_id: null,
      epub_blob_path: null,
      flashcards_blob_path: null,
      created_at: now,
      updated_at: now,
    }
    state.rows.set(row.id, row)
    return Promise.resolve([row])
  }

  if (query.startsWith('select * from jobs where id = ?')) {
    const row = state.rows.get(String(values[0]))
    return Promise.resolve(row ? [row] : [])
  }

  if (query.startsWith('update jobs set workflow_run_id = \'__starting__\'')) {
    const row = state.rows.get(String(values[0]))
    if (!row || row.workflow_run_id !== null) {
      return Promise.resolve([])
    }

    const updated: JobRecord = {
      ...row,
      workflow_run_id: '__starting__',
      updated_at: new Date('2026-01-01T00:00:01.000Z'),
    }
    state.rows.set(updated.id, updated)
    return Promise.resolve([updated])
  }

  if (query.startsWith('update jobs set status = case when ? then ? else status end,')) {
    const row = state.rows.get(String(values[14]))
    if (!row) {
      return Promise.resolve([])
    }

    const updated: JobRecord = {
      ...row,
      status: values[0] ? String(values[1]) : row.status,
      stage: values[2] ? String(values[3]) : row.stage,
      pct: values[4] ? Number(values[5]) : row.pct,
      error: values[6] ? (values[7] === null ? null : String(values[7])) : row.error,
      workflow_run_id: values[8]
        ? (values[9] === null ? null : String(values[9]))
        : row.workflow_run_id,
      epub_blob_path: values[10]
        ? (values[11] === null ? null : String(values[11]))
        : row.epub_blob_path,
      flashcards_blob_path: values[12]
        ? (values[13] === null ? null : String(values[13]))
        : row.flashcards_blob_path,
      updated_at: new Date('2026-01-01T00:00:02.000Z'),
    }
    state.rows.set(updated.id, updated)
    return Promise.resolve([updated])
  }

  throw new Error(`Unhandled query in test stub: ${query}`)
}

vi.mock('postgres', () => ({
  default: vi.fn(() => sqlStub),
}))

async function loadJobsModule() {
  vi.resetModules()
  process.env.DATABASE_URL = 'postgres://example.test/kindle'
  return import('../lib/jobs')
}

beforeEach(() => {
  state.queries = []
  state.rows = new Map()
})

afterEach(() => {
  delete process.env.DATABASE_URL
})

describe('updateJobRecord', () => {
  it('updates a row without an extra read-before-write query', async () => {
    const { createJobRecord, updateJobRecord } = await loadJobsModule()

    await createJobRecord({
      id: 'job_1',
      filename: 'sample.pdf',
      sourceBlobPath: 'source/sample.pdf',
      targetLang: 'es',
      provider: 'openai',
    })

    state.queries = []

    const updated = await updateJobRecord('job_1', {
      stage: 'translate',
      pct: 35,
      workflowRunId: 'run_123',
    })

    expect(updated?.status).toBe('queued')
    expect(updated?.stage).toBe('translate')
    expect(updated?.pct).toBe(35)
    expect(updated?.workflow_run_id).toBe('run_123')
    expect(state.queries.filter((query) => query.startsWith('select * from jobs'))).toHaveLength(0)
    expect(state.queries.filter((query) => query.startsWith('update jobs set'))).toHaveLength(1)
  })

  it('preserves omitted fields but still clears nullable columns explicitly set to null', async () => {
    const { createJobRecord, updateJobRecord } = await loadJobsModule()

    await createJobRecord({
      id: 'job_2',
      filename: 'sample.pdf',
      sourceBlobPath: 'source/sample.pdf',
      targetLang: 'fr',
      provider: 'hf',
    })

    await updateJobRecord('job_2', {
      error: 'temporary failure',
      workflowRunId: 'run_456',
      epubBlobPath: 'artifacts/sample.epub',
    })

    const cleared = await updateJobRecord('job_2', {
      error: null,
      workflowRunId: null,
    })

    expect(cleared?.error).toBeNull()
    expect(cleared?.workflow_run_id).toBeNull()
    expect(cleared?.epub_blob_path).toBe('artifacts/sample.epub')
    expect(cleared?.flashcards_blob_path).toBeNull()
  })
})
