import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadConfig() {
  vi.resetModules()
  return import('@/lib/config')
}

const VARS = [
  'OPENAI_BASE_URL',
  'HF_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'MAX_PDF_MB',
  'MAX_TRANSLATION_BATCHES',
  'TARGET_LANGS',
  'TRANSLATOR_PROVIDER',
]

afterEach(() => {
  for (const key of VARS) {
    delete process.env[key]
  }
})

describe('getConfig env hardening', () => {
  it('treats empty-string env vars as unset (no throw on an empty OPENAI_BASE_URL)', async () => {
    // This is exactly what broke production: OPENAI_BASE_URL="" failed .url().
    process.env.OPENAI_BASE_URL = ''
    process.env.HF_BASE_URL = '   '
    process.env.MAX_PDF_MB = ''
    process.env.MAX_TRANSLATION_BATCHES = ''
    const { getConfig } = await loadConfig()

    const config = getConfig()

    expect(config.openAiBaseUrl).toBeUndefined()
    expect(config.hfBaseUrl).toBeUndefined()
    expect(config.maxPdfBytes).toBe(100 * 1024 * 1024)
    expect(config.maxTranslationBatches).toBe(150)
    expect(config.translatorProvider).toBe('openai')
  })

  it('keeps a valid OPENAI_BASE_URL', async () => {
    process.env.OPENAI_BASE_URL = 'https://proxy.example.com/v1'
    const { getConfig } = await loadConfig()

    expect(getConfig().openAiBaseUrl).toBe('https://proxy.example.com/v1')
  })

  it('parses the JSON-array form of TARGET_LANGS', async () => {
    process.env.TARGET_LANGS = '["es","fr","de"]'
    const { getConfig } = await loadConfig()

    expect(getConfig().targetLangs).toEqual(['es', 'fr', 'de'])
  })
})
