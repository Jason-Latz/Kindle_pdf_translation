import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete process.env.MAX_FLASHCARDS
})

describe('buildFlashcardsCsv', () => {
  it('creates a csv with translated high-frequency terms', async () => {
    process.env.MAX_FLASHCARDS = '2'
    vi.resetModules()
    const { buildFlashcardsCsv } = await import('../lib/flashcards')

    const csv = await buildFlashcardsCsv(
      [
        'hola hola casa',
        'casa libro hola',
      ],
      'es',
      {
        id: 'openai',
        translateBatch: async (texts) => texts.map((text) => `en:${text}`),
      },
    )

    expect(csv).toContain('word,translation')
    expect(csv).toContain('"hola","en:hola"')
    expect(csv).toContain('"casa","en:casa"')
  })
})
