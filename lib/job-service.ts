import { randomUUID } from 'node:crypto'

import { send } from '@vercel/queue'
import { start } from 'workflow/api'

import { headBlob } from '@/lib/blob'
import { getConfig } from '@/lib/config'
import {
  clearWorkflowRunId,
  createJobRecord,
  finalizeWorkflowRunId,
  getConfiguredProvider,
  getJobRecord,
  markWorkflowStarting,
  updateJobRecord,
} from '@/lib/jobs'
import type { CreateJobRequest, JobRow, QueueJobCreatedMessage } from '@/lib/types'
import { translateBookWorkflow } from '@/lib/workflows/translate-book'
import { toErrorMessage } from '@/lib/utils'

export async function createQueuedJob(input: CreateJobRequest): Promise<JobRow> {
  await headBlob(input.sourcePathname)

  const row = await createJobRecord({
    id: randomUUID().replace(/-/g, ''),
    filename: input.filename,
    sourceBlobPath: input.sourcePathname,
    targetLang: input.targetLang,
    provider: getConfiguredProvider(),
  })

  const message: QueueJobCreatedMessage = {
    type: 'job.created',
    jobId: row.id,
  }

  try {
    const config = getConfig()
    await send('jobs', message, {
      idempotencyKey: row.id,
      region: config.queueRegion,
    })
  } catch (error) {
    await updateJobRecord(row.id, {
      status: 'error',
      stage: 'error',
      error: toErrorMessage(error, 'Unable to enqueue job'),
    })
    throw error
  }

  return row
}

export async function startQueuedWorkflow(jobId: string): Promise<JobRow | null> {
  const existing = await getJobRecord(jobId)
  if (!existing) {
    return null
  }

  if (existing.workflow_run_id && existing.workflow_run_id !== '__starting__') {
    return existing
  }

  const claimed = existing.workflow_run_id === '__starting__' ? existing : await markWorkflowStarting(jobId)
  if (!claimed) {
    return getJobRecord(jobId)
  }

  if (claimed.workflow_run_id && claimed.workflow_run_id !== '__starting__') {
    return claimed
  }

  try {
    const run = await start(translateBookWorkflow, [jobId])
    return finalizeWorkflowRunId(jobId, run.runId)
  } catch (error) {
    await clearWorkflowRunId(jobId)
    throw new Error(toErrorMessage(error, 'Unable to start workflow'))
  }
}
