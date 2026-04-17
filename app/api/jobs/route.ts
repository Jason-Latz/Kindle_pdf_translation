import { NextResponse } from 'next/server'

import { errorResponse } from '@/lib/http'
import { createQueuedJob } from '@/lib/job-service'
import { toJobStatusResponse } from '@/lib/types'
import { parseCreateJobRequest } from '@/lib/validation'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const payload = parseCreateJobRequest(await request.json())
    const job = await createQueuedJob(payload)
    return NextResponse.json(toJobStatusResponse(job), { status: 202 })
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Unable to create job',
      400,
    )
  }
}
