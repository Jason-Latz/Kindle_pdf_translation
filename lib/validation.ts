import { z } from 'zod'

import { getConfig } from '@/lib/config'
import type { CreateJobRequest } from '@/lib/types'
import { ensurePdfFilename, normalizeLang } from '@/lib/utils'

const SAFE_BLOB_SEGMENT = /^[a-zA-Z0-9._-]+$/

const createJobSchema = z.object({
  sourcePathname: z.string().trim().min(1),
  filename: z.string().trim().min(1),
  sizeBytes: z.coerce.number().int().positive(),
  targetLang: z.string().trim().min(1),
})

function validateSourceUploadPath(pathname: string): void {
  const config = getConfig()
  const prefix = `${config.sourceUploadPrefix}/`

  ensurePdfFilename(pathname)

  if (!pathname.startsWith(prefix)) {
    throw new Error('Uploaded PDF path is invalid')
  }

  const relativePath = pathname.slice(prefix.length)
  if (!relativePath || relativePath.includes('/') || relativePath.includes('..')) {
    throw new Error('Uploaded PDF path is invalid')
  }

  if (!SAFE_BLOB_SEGMENT.test(relativePath)) {
    throw new Error('Uploaded PDF path contains unsupported characters')
  }
}

export function parseCreateJobRequest(body: unknown): CreateJobRequest {
  const config = getConfig()
  const payload = createJobSchema.parse(body)
  const targetLang = normalizeLang(payload.targetLang)

  ensurePdfFilename(payload.filename)
  validateSourceUploadPath(payload.sourcePathname)

  if (payload.sizeBytes > config.maxPdfBytes) {
    throw new Error(
      `PDF size ${(payload.sizeBytes / (1024 * 1024)).toFixed(1)} MB exceeds ${(
        config.maxPdfBytes /
        (1024 * 1024)
      ).toFixed(0)} MB limit`,
    )
  }

  if (!config.targetLangs.includes(targetLang)) {
    throw new Error(`Target language '${payload.targetLang}' is not supported`)
  }

  return {
    sourcePathname: payload.sourcePathname,
    filename: payload.filename,
    sizeBytes: payload.sizeBytes,
    targetLang,
  }
}

export function validateUploadPath(pathname: string): void {
  validateSourceUploadPath(pathname)
}
