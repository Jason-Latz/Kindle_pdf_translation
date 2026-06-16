import { beforeEach, describe, expect, it, vi } from 'vitest'

const jobs = vi.hoisted(() => ({
  getJobRecord: vi.fn(),
  markWorkflowStarting: vi.fn(),
  finalizeWorkflowRunId: vi.fn(),
  clearWorkflowRunId: vi.fn(),
  getConfiguredProvider: vi.fn(() => 'openai'),
  createJobRecord: vi.fn(),
  updateJobRecord: vi.fn(),
}))
const blob = vi.hoisted(() => ({ headBlob: vi.fn() }))
const queue = vi.hoisted(() => ({ send: vi.fn() }))
const workflowApi = vi.hoisted(() => ({ start: vi.fn() }))

vi.mock('@/lib/jobs', () => jobs)
vi.mock('@/lib/blob', () => blob)
vi.mock('@vercel/queue', () => queue)
vi.mock('workflow/api', () => workflowApi)
vi.mock('@/lib/workflows/translate-book', () => ({ translateBookWorkflow: () => undefined }))

import { createQueuedJob, startQueuedWorkflow } from '@/lib/job-service'

beforeEach(() => {
  vi.resetAllMocks()
  jobs.getConfiguredProvider.mockReturnValue('openai')
})

describe('createQueuedJob', () => {
  const input = {
    sourcePathname: 'source/x.pdf',
    filename: 'x.pdf',
    sizeBytes: 1000,
    targetLang: 'es',
  }

  it('rejects when the stored blob is not a pdf', async () => {
    blob.headBlob.mockResolvedValue({ contentType: 'text/plain', size: 1000 })

    await expect(createQueuedJob(input)).rejects.toThrow(/not a PDF/)
    expect(jobs.createJobRecord).not.toHaveBeenCalled()
  })

  it('rejects when the blob size does not match the request metadata', async () => {
    blob.headBlob.mockResolvedValue({ contentType: 'application/pdf', size: 999 })

    await expect(createQueuedJob(input)).rejects.toThrow(/size does not match/)
    expect(jobs.createJobRecord).not.toHaveBeenCalled()
  })

  it('creates a job with a fresh download token and enqueues it idempotently', async () => {
    blob.headBlob.mockResolvedValue({ contentType: 'application/pdf', size: 1000 })
    jobs.createJobRecord.mockImplementation(async (rec: { id: string }) => ({
      ...rec,
      status: 'queued',
    }))
    queue.send.mockResolvedValue(undefined)

    const row = await createQueuedJob(input)

    expect(jobs.createJobRecord).toHaveBeenCalledTimes(1)
    const createArg = jobs.createJobRecord.mock.calls[0][0]
    expect(createArg.downloadToken).toMatch(/^[0-9a-f]{64}$/)
    expect(createArg.provider).toBe('openai')
    expect(queue.send).toHaveBeenCalledWith(
      'jobs',
      { type: 'job.created', jobId: row.id },
      expect.objectContaining({ idempotencyKey: row.id }),
    )
  })
})

describe('startQueuedWorkflow idempotency', () => {
  it('returns null and never claims when the job does not exist', async () => {
    jobs.getJobRecord.mockResolvedValue(null)

    expect(await startQueuedWorkflow('missing')).toBeNull()
    expect(jobs.markWorkflowStarting).not.toHaveBeenCalled()
    expect(workflowApi.start).not.toHaveBeenCalled()
  })

  it('does not start a second workflow when one is already running', async () => {
    jobs.getJobRecord.mockResolvedValue({ id: 'j', workflow_run_id: 'run_existing' })

    const result = await startQueuedWorkflow('j')

    expect(result).toEqual({ id: 'j', workflow_run_id: 'run_existing' })
    expect(jobs.markWorkflowStarting).not.toHaveBeenCalled()
    expect(workflowApi.start).not.toHaveBeenCalled()
  })

  it('does not start when the starting claim is lost to a concurrent delivery', async () => {
    jobs.getJobRecord
      .mockResolvedValueOnce({ id: 'j', workflow_run_id: null })
      .mockResolvedValueOnce({ id: 'j', workflow_run_id: '__starting__' })
    jobs.markWorkflowStarting.mockResolvedValue(null)

    const result = await startQueuedWorkflow('j')

    expect(workflowApi.start).not.toHaveBeenCalled()
    expect(result).toEqual({ id: 'j', workflow_run_id: '__starting__' })
  })

  it('claims, starts, and finalizes the run id exactly once', async () => {
    jobs.getJobRecord.mockResolvedValue({ id: 'j', workflow_run_id: null })
    jobs.markWorkflowStarting.mockResolvedValue({ id: 'j', workflow_run_id: '__starting__' })
    workflowApi.start.mockResolvedValue({ runId: 'run_new' })
    jobs.finalizeWorkflowRunId.mockResolvedValue({ id: 'j', workflow_run_id: 'run_new' })

    const result = await startQueuedWorkflow('j')

    expect(workflowApi.start).toHaveBeenCalledTimes(1)
    expect(jobs.finalizeWorkflowRunId).toHaveBeenCalledWith('j', 'run_new')
    expect(result).toEqual({ id: 'j', workflow_run_id: 'run_new' })
  })

  it('clears the __starting__ sentinel when start throws so the job is retryable', async () => {
    jobs.getJobRecord.mockResolvedValue({ id: 'j', workflow_run_id: null })
    jobs.markWorkflowStarting.mockResolvedValue({ id: 'j', workflow_run_id: '__starting__' })
    workflowApi.start.mockRejectedValue(new Error('boom'))

    await expect(startQueuedWorkflow('j')).rejects.toThrow(/boom|Unable to start workflow/)
    expect(jobs.clearWorkflowRunId).toHaveBeenCalledWith('j')
  })
})
