import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

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

// Per-job download capability: a 256-bit random token issued at creation and
// required (constant-time compared) by the artifact download route.
export function generateDownloadToken(): string {
  return randomBytes(32).toString('hex')
}

export function safeTokenEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) {
    return false
  }
  return timingSafeEqual(providedBuffer, expectedBuffer)
}

// Char codes stripped from a Content-Disposition filename so a crafted value
// cannot break out of the quoted-string / inject response headers:
//   < 0x20  control chars, incl. CR (0x0d) / LF (0x0a) response-splitting
//   0x22    double-quote   0x5c  backslash (quoted-string escape)   0x7f  DEL
// Spaces and unicode are preserved for a readable download name.
export function sanitizeDownloadFilename(name: string, fallback: string): string {
  let cleaned = ''
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x22 || code === 0x5c || code === 0x7f) {
      continue
    }
    cleaned += char
  }
  cleaned = cleaned.trim().slice(0, 200)
  return cleaned || fallback
}
