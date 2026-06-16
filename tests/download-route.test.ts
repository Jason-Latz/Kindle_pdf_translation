import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getJobRecord: vi.fn(),
  downloadPrivateBlob: vi.fn(),
}))

vi.mock('@/lib/jobs', () => ({
  getJobRecord: mocks.getJobRecord,
}))

vi.mock('@/lib/blob', () => ({
  downloadPrivateBlob: mocks.downloadPrivateBlob,
}))

import { GET } from '@/app/api/jobs/[id]/download/route'

const TOKEN = 'secret-download-token-0123456789'

function baseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job_abc',
    filename: 'My Book.pdf',
    source_blob_path: 'source/x.pdf',
    target_lang: 'es',
    provider: 'openai',
    status: 'done',
    stage: 'done',
    pct: 100,
    error: null,
    workflow_run_id: 'run_1',
    epub_blob_path: 'artifacts/job_abc/My-Book.epub',
    flashcards_blob_path: 'artifacts/job_abc/My-Book.csv',
    download_token: TOKEN,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function streamBlob() {
  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('artifact-bytes'))
        controller.close()
      },
    }),
  }
}

function get(id: string, query: string) {
  const request = new Request(`http://localhost/api/jobs/${id}/download?${query}`)
  return GET(request, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  mocks.getJobRecord.mockReset()
  mocks.downloadPrivateBlob.mockReset()
  mocks.downloadPrivateBlob.mockResolvedValue(streamBlob())
})

describe('GET /api/jobs/[id]/download authorization', () => {
  it('rejects a download with no token (the IDOR guard)', async () => {
    mocks.getJobRecord.mockResolvedValue(baseJob())

    const response = await get('job_abc', 'file_type=epub')

    expect(response.status).toBe(403)
    expect(mocks.downloadPrivateBlob).not.toHaveBeenCalled()
  })

  it('rejects a download with the wrong token', async () => {
    mocks.getJobRecord.mockResolvedValue(baseJob())

    const response = await get('job_abc', 'file_type=epub&token=not-the-token')

    expect(response.status).toBe(403)
    expect(mocks.downloadPrivateBlob).not.toHaveBeenCalled()
  })

  it('rejects when the stored token is null (legacy rows)', async () => {
    mocks.getJobRecord.mockResolvedValue(baseJob({ download_token: null }))

    const response = await get('job_abc', `file_type=epub&token=${TOKEN}`)

    expect(response.status).toBe(403)
    expect(mocks.downloadPrivateBlob).not.toHaveBeenCalled()
  })

  it('streams the artifact when the token matches', async () => {
    mocks.getJobRecord.mockResolvedValue(baseJob())

    const response = await get('job_abc', `file_type=epub&token=${TOKEN}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/epub+zip')
    expect(mocks.downloadPrivateBlob).toHaveBeenCalledWith('artifacts/job_abc/My-Book.epub')
  })

  it('returns 404 for an unknown job', async () => {
    mocks.getJobRecord.mockResolvedValue(null)

    const response = await get('missing', `file_type=epub&token=${TOKEN}`)

    expect(response.status).toBe(404)
  })

  it('rejects an unsupported file_type before touching the job', async () => {
    const response = await get('job_abc', `file_type=zip&token=${TOKEN}`)

    expect(response.status).toBe(400)
    expect(mocks.getJobRecord).not.toHaveBeenCalled()
  })
})

describe('Content-Disposition filename sanitization (header-injection guard)', () => {
  it('strips CR/LF and quotes from a crafted filename', async () => {
    mocks.getJobRecord.mockResolvedValue(
      baseJob({ filename: 'evil"\r\nSet-Cookie: x=y.pdf' }),
    )

    const response = await get('job_abc', `file_type=epub&token=${TOKEN}`)

    expect(response.status).toBe(200)
    const disposition = response.headers.get('content-disposition') ?? ''
    expect(disposition).not.toMatch(/[\r\n]/)
    // The inner double-quote is removed so it cannot break out of the quoted-string.
    expect(disposition).toBe('attachment; filename="evilSet-Cookie: x=y.epub"')
  })
})
