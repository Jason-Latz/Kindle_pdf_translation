import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadLanguages() {
  vi.resetModules()
  return import('@/lib/languages')
}

afterEach(() => {
  delete process.env.TARGET_LANGS
})

describe('getSupportedLanguages', () => {
  it('derives the offered languages from TARGET_LANGS config (single source of truth)', async () => {
    process.env.TARGET_LANGS = 'es,fr'
    const { getSupportedLanguages } = await loadLanguages()

    expect(getSupportedLanguages()).toEqual([
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
    ])
  })

  it('falls back to an uppercased code for unlabeled languages so the list cannot drift', async () => {
    process.env.TARGET_LANGS = 'es,ja'
    const { getSupportedLanguages } = await loadLanguages()

    expect(getSupportedLanguages()).toEqual([
      { value: 'es', label: 'Spanish' },
      { value: 'ja', label: 'JA' },
    ])
  })
})
