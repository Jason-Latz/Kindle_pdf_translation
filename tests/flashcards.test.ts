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

  it('reuses cached tokenizers across paragraphs instead of rebuilding them per paragraph', async () => {
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

    // One word segmenter + one sentence segmenter, created once for the
    // language and reused — not rebuilt for each of the three paragraphs.
    expect(segmenterCreations).toBe(2)
  })

  it('neutralizes spreadsheet formula injection in csv values', async () => {
    process.env.MAX_FLASHCARDS = '1'
    const { buildFlashcardsCsv } = await loadFlashcardsModule()

    const csv = await buildFlashcardsCsv(['hola hola hola'], 'es', {
      id: 'openai',
      translateBatch: async (texts) => texts.map(() => '=SUM(A1:A9)'),
    })

    // Leading '=' must be prefixed with a single quote so it is not evaluated.
    expect(csv).toContain(`"'=SUM(A1:A9)"`)
    expect(csv).not.toContain('"=SUM(A1:A9)"')
  })

  it('includes a context sentence for each flashcard', async () => {
    process.env.MAX_FLASHCARDS = '1'
    const { buildFlashcardsCsv } = await loadFlashcardsModule()

    const csv = await buildFlashcardsCsv(
      ['El gato duerme. La casa es grande y la casa es azul.'],
      'es',
      {
        id: 'openai',
        translateBatch: async (texts) => texts.map((text) => `en:${text}`),
      },
    )

    expect(csv.split('\n')[0]).toBe('word,translation,context')
    // 'casa' is the most frequent content word; its context is the first
    // sentence that contains it.
    expect(csv).toContain('"casa","en:casa","La casa es grande y la casa es azul."')
  })
})
