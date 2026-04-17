import { NextResponse } from 'next/server'

import { errorResponse } from '@/lib/http'
import { getJobRecord } from '@/lib/jobs'
import { toJobStatusResponse } from '@/lib/types'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const job = await getJobRecord(id)

  if (!job) {
    return errorResponse(`Job '${id}' not found`, 404)
  }

  return NextResponse.json(toJobStatusResponse(job))
}
