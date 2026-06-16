import { afterEach, describe, expect, it, vi } from 'vitest'

const OriginalSegmenter = Intl.Segmenter

async function loadFlashcardsModule() {
  vi.resetModules()
  return import('../lib/flashcards')
}

afterEach(() => {
  delete process.env.MAX_FLASHCARDS
  Object.defineProperty(Intl, 'Segmenter', {
    configurable: true,
    writable: true,
    value: OriginalSegmenter,
  })
})

describe('buildFlashcardsCsv', () => {
  it('creates a csv with translated high-frequency terms', async () => {
    process.env.MAX_FLASHCARDS = '2'
    const { buildFlashcardsCsv } = await loadFlashcardsModule()

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

  it('reuses one segmenter while scanning multiple paragraphs in the same language', async () => {
    process.env.MAX_FLASHCARDS = '3'

    let segmenterCreations = 0
    class CountingSegmenter extends OriginalSegmenter {
      constructor(...args: ConstructorParameters<typeof Intl.Segmenter>) {
        super(...args)
        segmenterCreations += 1
      }
    }

    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      writable: true,
      value: CountingSegmenter,
    })

    const { buildFlashcardsCsv } = await loadFlashcardsModule()

    await buildFlashcardsCsv(
      [
        'hola mundo libro',
        'libro casa camino',
        'camino libro hola',
      ],
      'es',
      {
        id: 'openai',
        translateBatch: async (texts) => texts.map((text) => `en:${text}`),
      },
    )

    expect(segmenterCreations).toBe(1)
  })
})
