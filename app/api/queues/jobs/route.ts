import { handleCallback } from '@vercel/queue'

import { startQueuedWorkflow } from '@/lib/job-service'
import type { QueueJobCreatedMessage } from '@/lib/types'

export const runtime = 'nodejs'

const callback = handleCallback<QueueJobCreatedMessage>(async (message) => {
  if (message.type !== 'job.created') {
    throw new Error(`Unsupported queue message '${String(message.type)}'`)
  }

  const job = await startQueuedWorkflow(message.jobId)
  if (!job) {
    throw new Error(`Job '${message.jobId}' not found`)
  }
})

export async function POST(request: Request) {
  return callback(request)
}
