import { randomUUID } from 'node:crypto'

import { getConfig } from '@/lib/config'

const SAFE_FILENAME_PATTERN = /[^a-zA-Z0-9._-]+/g

export function normalizeLang(value: string): string {
  return value.trim().toLowerCase()
}

export function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim()
  const safe = trimmed.replace(SAFE_FILENAME_PATTERN, '-').replace(/-+/g, '-')
  return safe || 'upload.pdf'
}

export function ensurePdfFilename(filename: string): void {
  if (!filename.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are supported')
  }
}

export function buildSourceBlobPath(filename: string): string {
  const config = getConfig()
  return `${config.sourceUploadPrefix}/${randomUUID()}-${sanitizeFilename(filename)}`
}

export function buildJobArtifactPath(jobId: string, filename: string): string {
  const config = getConfig()
  return `${config.artifactPrefix}/${jobId}/${sanitizeFilename(filename)}`
}

export function artifactFilename(originalName: string | null | undefined, extension: string, fallback: string): string {
  if (!originalName) {
    return fallback
  }

  const lastDot = originalName.lastIndexOf('.')
  const stem = lastDot > 0 ? originalName.slice(0, lastDot) : originalName
  return `${stem}${extension}`
}

export function toErrorMessage(error: unknown, fallback = 'Unexpected error'): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}
