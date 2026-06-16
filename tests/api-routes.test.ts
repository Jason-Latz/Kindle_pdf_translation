import { beforeEach, describe, expect, it, vi } from 'vitest'

const jobService = vi.hoisted(() => ({ createQueuedJob: vi.fn() }))
const validation = vi.hoisted(() => ({ parseCreateJobRequest: vi.fn() }))

vi.mock('@/lib/job-service', () => jobService)
vi.mock('@/lib/validation', () => validation)

import { GET as healthzGET } from '@/app/api/healthz/route'
import { POST as jobsPOST } from '@/app/api/jobs/route'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/healthz', () => {
  it('returns { ok: true }', async () => {
    const response = healthzGET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})

describe('POST /api/jobs', () => {
  function jobRequest(body: unknown) {
    return new Request('http://localhost/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 202 and surfaces the download token in the creation response', async () => {
    validation.parseCreateJobRequest.mockReturnValue({
      sourcePathname: 'source/x.pdf',
      filename: 'x.pdf',
      sizeBytes: 10,
      targetLang: 'es',
    })
    jobService.createQueuedJob.mockResolvedValue({
      id: 'job1',
      status: 'queued',
      stage: 'queued',
      pct: 0,
      error: null,
      download_token: 'secret-token',
    })

    const response = await jobsPOST(jobRequest({ filename: 'x.pdf' }))

    expect(response.status).toBe(202)
    const body = await response.json()
    expect(body.job_id).toBe('job1')
    expect(body.download_token).toBe('secret-token')
  })

  it('returns 400 when validation rejects the request', async () => {
    validation.parseCreateJobRequest.mockImplementation(() => {
      throw new Error('Only PDF files are supported')
    })

    const response = await jobsPOST(jobRequest({ filename: 'x.txt' }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.detail).toMatch(/PDF/)
  })
})
