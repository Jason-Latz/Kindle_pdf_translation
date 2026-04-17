import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadValidationModule() {
  vi.resetModules()
  return import('../lib/validation')
}

afterEach(() => {
  delete process.env.TARGET_LANGS
  delete process.env.MAX_PDF_MB
  delete process.env.MAX_PAGES
  delete process.env.MAX_FLASHCARDS
  delete process.env.TRANSLATOR_PROVIDER
})

describe('parseCreateJobRequest', () => {
  it('normalizes supported target languages', async () => {
    process.env.TARGET_LANGS = 'es,fr'
    const { parseCreateJobRequest } = await loadValidationModule()

    expect(
      parseCreateJobRequest({
        sourcePathname: 'source/example.pdf',
        filename: 'example.pdf',
        sizeBytes: 1024,
        targetLang: ' FR ',
      }),
    ).toEqual({
      sourcePathname: 'source/example.pdf',
      filename: 'example.pdf',
      sizeBytes: 1024,
      targetLang: 'fr',
    })
  })

  it('accepts legacy json-array target language env values', async () => {
    process.env.TARGET_LANGS = '["es","fr"]'
    const { parseCreateJobRequest } = await loadValidationModule()

    expect(
      parseCreateJobRequest({
        sourcePathname: 'source/example.pdf',
        filename: 'example.pdf',
        sizeBytes: 1024,
        targetLang: 'es',
      }),
    ).toEqual({
      sourcePathname: 'source/example.pdf',
      filename: 'example.pdf',
      sizeBytes: 1024,
      targetLang: 'es',
    })
  })

  it('rejects oversized uploads', async () => {
    process.env.MAX_PDF_MB = '1'
    const { parseCreateJobRequest } = await loadValidationModule()

    expect(() =>
      parseCreateJobRequest({
        sourcePathname: 'source/example.pdf',
        filename: 'example.pdf',
        sizeBytes: 2 * 1024 * 1024,
        targetLang: 'es',
      }),
    ).toThrow(/exceeds/)
  })
})
