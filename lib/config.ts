import { z } from 'zod'

import type { TranslationProviderId } from '@/lib/types'

const envSchema = z.object({
  TRANSLATOR_PROVIDER: z.enum(['openai', 'hf']).default('openai'),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-4.1-mini'),
  OPENAI_BASE_URL: z.string().trim().url().optional(),
  HF_API_TOKEN: z.string().trim().min(1).optional(),
  HF_MODEL_ID: z.string().trim().min(1).optional(),
  HF_BASE_URL: z.string().trim().url().optional(),
  TARGET_LANGS: z.string().default('es,fr,de,it,pt'),
  MAX_PDF_MB: z.coerce.number().int().positive().default(100),
  MAX_PAGES: z.coerce.number().int().positive().default(600),
  MAX_FLASHCARDS: z.coerce.number().int().positive().default(30),
  POSTGRES_URL: z.string().trim().min(1).optional(),
  DATABASE_URL: z.string().trim().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().trim().min(1).optional(),
  VERCEL_REGION: z.string().trim().min(1).optional(),
  QUEUE_REGION: z.string().trim().min(1).optional(),
})

export type AppConfig = {
  translatorProvider: TranslationProviderId
  openAiApiKey?: string
  openAiModel: string
  openAiBaseUrl?: string
  hfApiToken?: string
  hfModelId?: string
  hfBaseUrl?: string
  targetLangs: string[]
  maxPdfBytes: number
  maxPages: number
  maxFlashcards: number
  databaseUrl?: string
  blobReadWriteToken?: string
  queueRegion?: string
  sourceUploadPrefix: string
  artifactPrefix: string
}

let cachedConfig: AppConfig | null = null

function normalizeLang(value: string): string {
  return value.trim().toLowerCase().replace(/^[\[\]"']+|[\[\]"']+$/g, '')
}

function parseTargetLangs(raw: string): string[] {
  const trimmed = raw.trim()

  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((value) => normalizeLang(String(value))).filter(Boolean)
      }
    } catch {
      // Fall back to comma splitting below.
    }
  }

  return trimmed.split(',').map(normalizeLang).filter(Boolean)
}

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const env = envSchema.parse(process.env)
  cachedConfig = {
    translatorProvider: env.TRANSLATOR_PROVIDER,
    openAiApiKey: env.OPENAI_API_KEY,
    openAiModel: env.OPENAI_MODEL,
    openAiBaseUrl: env.OPENAI_BASE_URL,
    hfApiToken: env.HF_API_TOKEN,
    hfModelId: env.HF_MODEL_ID,
    hfBaseUrl: env.HF_BASE_URL,
    targetLangs: parseTargetLangs(env.TARGET_LANGS),
    maxPdfBytes: env.MAX_PDF_MB * 1024 * 1024,
    maxPages: env.MAX_PAGES,
    maxFlashcards: env.MAX_FLASHCARDS,
    databaseUrl: env.POSTGRES_URL ?? env.DATABASE_URL,
    blobReadWriteToken: env.BLOB_READ_WRITE_TOKEN,
    queueRegion: env.QUEUE_REGION ?? env.VERCEL_REGION,
    sourceUploadPrefix: 'source',
    artifactPrefix: 'artifacts',
  }

  return cachedConfig
}

export function requireDatabaseUrl(): string {
  const { databaseUrl } = getConfig()
  if (!databaseUrl) {
    throw new Error('POSTGRES_URL or DATABASE_URL is required')
  }
  return databaseUrl
}

export function requireBlobToken(): string {
  const { blobReadWriteToken } = getConfig()
  if (!blobReadWriteToken) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required')
  }
  return blobReadWriteToken
}
