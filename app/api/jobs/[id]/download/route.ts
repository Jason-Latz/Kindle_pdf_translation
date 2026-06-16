import { NextResponse } from 'next/server'

import { downloadPrivateBlob } from '@/lib/blob'
import { errorResponse } from '@/lib/http'
import { getJobRecord } from '@/lib/jobs'
import type { DownloadFileType } from '@/lib/types'
import { artifactFilename, safeTokenEqual, sanitizeDownloadFilename } from '@/lib/utils'

export const runtime = 'nodejs'

function resolveDownload(job: NonNullable<Awaited<ReturnType<typeof getJobRecord>>>, fileType: DownloadFileType) {
  if (fileType === 'epub') {
    return {
      pathname: job.epub_blob_path,
      filename: sanitizeDownloadFilename(artifactFilename(job.filename, '.epub', 'book.epub'), 'book.epub'),
      contentType: 'application/epub+zip',
    }
  }

  return {
    pathname: job.flashcards_blob_path,
    filename: sanitizeDownloadFilename(artifactFilename(job.filename, '.csv', 'flashcards.csv'), 'flashcards.csv'),
    contentType: 'text/csv',
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(request.url)
  const fileType = url.searchParams.get('file_type')
  const token = url.searchParams.get('token')

  if (fileType !== 'epub' && fileType !== 'flashcards') {
    return errorResponse(`Unsupported artifact type '${fileType}'`, 400)
  }

  const job = await getJobRecord(id)
  if (!job) {
    return errorResponse(`Job '${id}' not found`, 404)
  }

  // Ownership check: the per-job download token is required and compared in
  // constant time. It is only ever returned in the job-creation response, so a
  // job id alone (e.g. leaked from a poll URL) does not grant artifact access.
  if (!job.download_token || !token || !safeTokenEqual(token, job.download_token)) {
    return errorResponse('A valid download token is required', 403)
  }

  const artifact = resolveDownload(job, fileType)
  if (!artifact.pathname) {
    return errorResponse(`Artifact '${fileType}' for job '${id}' not available`, 404)
  }

  try {
    const blob = await downloadPrivateBlob(artifact.pathname)
    return new NextResponse(blob.stream, {
      headers: {
        'Content-Type': artifact.contentType,
        'Content-Disposition': `attachment; filename="${artifact.filename}"`,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return errorResponse(`Artifact '${fileType}' for job '${id}' not available`, 404)
  }
}
