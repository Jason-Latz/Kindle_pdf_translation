import { z } from 'zod'

import { getConfig } from '@/lib/config'
import type { CreateJobRequest } from '@/lib/types'
import { ensurePdfFilename, normalizeLang } from '@/lib/utils'

const createJobSchema = z.object({
  sourcePathname: z.string().trim().min(1),
  filename: z.string().trim().min(1),
  sizeBytes: z.coerce.number().int().positive(),
  targetLang: z.string().trim().min(1),
})

export function parseCreateJobRequest(body: unknown): CreateJobRequest {
  const config = getConfig()
  const payload = createJobSchema.parse(body)
  const targetLang = normalizeLang(payload.targetLang)

  ensurePdfFilename(payload.filename)

  if (!payload.sourcePathname.startsWith(`${config.sourceUploadPrefix}/`)) {
    throw new Error('Uploaded PDF path is invalid')
  }

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
  ensurePdfFilename(pathname)
}
