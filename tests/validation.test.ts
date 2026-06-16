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

  it('rejects uploads outside the source prefix', async () => {
    const { parseCreateJobRequest } = await loadValidationModule()

    expect(() =>
      parseCreateJobRequest({
        sourcePathname: 'artifacts/example.pdf',
        filename: 'example.pdf',
        sizeBytes: 1024,
        targetLang: 'es',
      }),
    ).toThrow(/path/)
  })

  it('rejects nested or unsafe source paths', async () => {
    const { validateUploadPath } = await loadValidationModule()

    expect(() => validateUploadPath('source/../example.pdf')).toThrow(/path/)
    expect(() => validateUploadPath('source/nested/example.pdf')).toThrow(/path/)
  })

  it('rejects an over-long filename to bound storage/DoS', async () => {
    const { parseCreateJobRequest } = await loadValidationModule()

    expect(() =>
      parseCreateJobRequest({
        sourcePathname: 'source/example.pdf',
        filename: `${'a'.repeat(300)}.pdf`,
        sizeBytes: 1024,
        targetLang: 'es',
      }),
    ).toThrow()
  })
})
