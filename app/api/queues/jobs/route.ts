import { QueueClient } from '@vercel/queue'

import { startQueuedWorkflow } from '@/lib/job-service'
import type { QueueJobCreatedMessage } from '@/lib/types'

export const runtime = 'nodejs'

const queue = new QueueClient({
  region: process.env.QUEUE_REGION?.trim() || process.env.VERCEL_REGION?.trim() || 'iad1',
})

const callback = queue.handleCallback<QueueJobCreatedMessage>(async (message) => {
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
