import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockCreate } }
  },
}))

async function loadProviders() {
  vi.resetModules()
  return import('@/lib/providers')
}

function openAiResponse(content: string) {
  return { choices: [{ message: { content } }] }
}

beforeEach(() => {
  mockCreate.mockReset()
  process.env.TRANSLATOR_PROVIDER = 'openai'
  process.env.OPENAI_API_KEY = 'sk-test'
})

afterEach(() => {
  delete process.env.TRANSLATOR_PROVIDER
  delete process.env.OPENAI_API_KEY
  delete process.env.MAX_TRANSLATION_BATCHES
})

describe('OpenAI provider translateBatch', () => {
  it('returns translations in order from a translations array', async () => {
    mockCreate.mockResolvedValue(openAiResponse(JSON.stringify({ translations: ['uno', 'dos'] })))
    const { getTranslationProvider } = await loadProviders()

    const out = await getTranslationProvider().translateBatch(['one', 'two'], {
      srcLang: 'en',
      tgtLang: 'es',
    })

    expect(out).toEqual(['uno', 'dos'])
  })

  it('accepts a bare JSON array as well as a { translations } wrapper', async () => {
    mockCreate.mockResolvedValue(openAiResponse(JSON.stringify(['uno', 'dos'])))
    const { getTranslationProvider } = await loadProviders()

    const out = await getTranslationProvider().translateBatch(['one', 'two'], {
      srcLang: 'en',
      tgtLang: 'es',
    })

    expect(out).toEqual(['uno', 'dos'])
  })

  it('throws on a translation count mismatch instead of returning a partial result', async () => {
    mockCreate.mockResolvedValue(openAiResponse(JSON.stringify({ translations: ['uno'] })))
    const { getTranslationProvider } = await loadProviders()

    await expect(
      getTranslationProvider().translateBatch(['one', 'two'], { srcLang: 'en', tgtLang: 'es' }),
    ).rejects.toThrow(/returned 1 translations for 2 inputs/)
  })

  it('throws on invalid JSON', async () => {
    mockCreate.mockResolvedValue(openAiResponse('this is not json'))
    const { getTranslationProvider } = await loadProviders()

    await expect(
      getTranslationProvider().translateBatch(['one'], { srcLang: 'en', tgtLang: 'es' }),
    ).rejects.toThrow(/did not return valid JSON/)
  })

  it('returns [] for empty input without calling the model', async () => {
    const { getTranslationProvider } = await loadProviders()

    const out = await getTranslationProvider().translateBatch([], { srcLang: 'en', tgtLang: 'es' })

    expect(out).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects (and never calls the model) when the batch cap is exceeded', async () => {
    process.env.MAX_TRANSLATION_BATCHES = '1'
    const { getTranslationProvider } = await loadProviders()

    // Two large paragraphs chunk into more than one 5000-token batch.
    const big = 'palabra '.repeat(4000)
    await expect(
      getTranslationProvider().translateBatch([big, big], { srcLang: 'en', tgtLang: 'es' }),
    ).rejects.toThrow(/too large to translate/)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
