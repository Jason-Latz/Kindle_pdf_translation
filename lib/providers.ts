import OpenAI from 'openai'
import { getEncoding } from 'js-tiktoken'
import { FatalError } from 'workflow'

import { getConfig } from '@/lib/config'
import type { TranslationProviderId } from '@/lib/types'

const encoding = getEncoding('cl100k_base')
const DEFAULT_INPUT_TOKEN_BUDGET = 5000

export type TranslationProvider = {
  id: TranslationProviderId
  translateBatch: (texts: string[], options: { srcLang: string; tgtLang: string }) => Promise<string[]>
}

function chunkByTokens(texts: string[], maxTokens = DEFAULT_INPUT_TOKEN_BUDGET): string[][] {
  const batches: string[][] = []
  let current: string[] = []
  let currentTokens = 0

  for (const text of texts) {
    const tokenCount = Math.max(1, encoding.encode(text).length)

    if (current.length > 0 && currentTokens + tokenCount > maxTokens) {
      batches.push(current)
      current = []
      currentTokens = 0
    }

    current.push(text)
    currentTokens += tokenCount
  }

  if (current.length > 0) {
    batches.push(current)
  }

  return batches
}

// Bound the LLM fan-out: a single job may not exceed maxTranslationBatches
// provider calls. Caps both cost and step duration for very large (but
// in-page-limit) PDFs. Deterministic for a given input, so it fails the step
// without retrying (FatalError) rather than re-billing on every retry.
function chunkByTokensWithCap(texts: string[]): string[][] {
  const batches = chunkByTokens(texts)
  const { maxTranslationBatches } = getConfig()
  if (batches.length > maxTranslationBatches) {
    throw new FatalError(
      `Document is too large to translate in one job: ${batches.length} batches exceed the limit of ${maxTranslationBatches}`,
    )
  }
  return batches
}

function buildPrompt(paragraphs: string[], srcLang: string, tgtLang: string): string {
  return JSON.stringify(
    {
      source_language: srcLang,
      target_language: tgtLang,
      paragraphs,
    },
    null,
    2,
  )
}

function parseTranslationPayload(raw: string, expectedCount: number, providerName: string): string[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new FatalError(`${providerName} did not return valid JSON`)
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    'translations' in parsed &&
    Array.isArray((parsed as { translations: unknown }).translations)
  ) {
    parsed = (parsed as { translations: unknown[] }).translations
  }

  if (!Array.isArray(parsed)) {
    throw new FatalError(`${providerName} response did not include a translations array`)
  }

  const translations = parsed.map((value) => String(value))
  if (translations.length !== expectedCount) {
    throw new FatalError(
      `${providerName} returned ${translations.length} translations for ${expectedCount} inputs`,
    )
  }

  return translations
}

function createOpenAiProvider(): TranslationProvider {
  const config = getConfig()
  if (!config.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required for the OpenAI provider')
  }

  const client = new OpenAI({
    apiKey: config.openAiApiKey,
    baseURL: config.openAiBaseUrl,
  })

  return {
    id: 'openai',
    async translateBatch(texts, options) {
      if (texts.length === 0) {
        return []
      }

      const output: string[] = []
      for (const batch of chunkByTokensWithCap(texts)) {
        const response = await client.chat.completions.create({
          model: config.openAiModel,
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You are a professional literary translator. Translate each paragraph exactly once and return JSON with a "translations" array in the same order.',
            },
            {
              role: 'user',
              content: buildPrompt(batch, options.srcLang, options.tgtLang),
            },
          ],
        })

        const content = response.choices[0]?.message?.content ?? ''
        output.push(...parseTranslationPayload(content, batch.length, 'OpenAI'))
      }

      return output
    },
  }
}

function extractHfText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload
  }

  if (Array.isArray(payload)) {
    const first = payload[0]
    if (first && typeof first === 'object' && 'generated_text' in first) {
      return String((first as { generated_text: unknown }).generated_text)
    }
  }

  if (payload && typeof payload === 'object' && 'generated_text' in payload) {
    return String((payload as { generated_text: unknown }).generated_text)
  }

  return JSON.stringify(payload)
}

// HF text models often wrap the JSON we asked for in prose or markdown fences.
// Extract the outermost JSON array/object so parsing is resilient to that.
function extractJsonBlock(text: string): string {
  const trimmed = text.trim()
  const firstBracket = trimmed.indexOf('[')
  const firstBrace = trimmed.indexOf('{')

  let start = -1
  let closeChar = ''
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket
    closeChar = ']'
  } else if (firstBrace !== -1) {
    start = firstBrace
    closeChar = '}'
  }

  if (start === -1) {
    return trimmed
  }

  const end = trimmed.lastIndexOf(closeChar)
  return end > start ? trimmed.slice(start, end + 1) : trimmed
}

let hfExperimentalWarned = false
function warnHfExperimental(): void {
  if (!hfExperimentalWarned) {
    hfExperimentalWarned = true
    console.warn(
      '[translator] The Hugging Face provider is experimental and best-effort; ' +
        'model responses are parsed leniently. Prefer the OpenAI provider for production.',
    )
  }
}

function createHfProvider(): TranslationProvider {
  const config = getConfig()
  if (!config.hfModelId) {
    throw new Error('HF_MODEL_ID is required for the Hugging Face provider')
  }
  warnHfExperimental()

  const endpoint = config.hfBaseUrl ?? `https://api-inference.huggingface.co/models/${config.hfModelId}`

  return {
    id: 'hf',
    async translateBatch(texts, options) {
      if (texts.length === 0) {
        return []
      }

      const output: string[] = []
      for (const batch of chunkByTokensWithCap(texts)) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.hfApiToken ? { Authorization: `Bearer ${config.hfApiToken}` } : {}),
          },
          body: JSON.stringify({
            inputs: [
              'You are a professional literary translator. Return JSON with a "translations" array in the same order.',
              buildPrompt(batch, options.srcLang, options.tgtLang),
            ].join('\n\n'),
            parameters: {
              return_full_text: false,
              max_new_tokens: 4096,
              temperature: 0.2,
            },
          }),
        })

        if (!response.ok) {
          throw new Error(`Hugging Face inference failed with status ${response.status}`)
        }

        const raw = extractJsonBlock(extractHfText(await response.json()))
        output.push(...parseTranslationPayload(raw, batch.length, 'Hugging Face'))
      }

      return output
    },
  }
}

export function getTranslationProvider(): TranslationProvider {
  const config = getConfig()
  return config.translatorProvider === 'hf' ? createHfProvider() : createOpenAiProvider()
}
