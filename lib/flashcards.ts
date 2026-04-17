import * as stopword from 'stopword'

import { getConfig } from '@/lib/config'
import type { TranslationProvider } from '@/lib/providers'

const STOPWORD_MAP: Record<string, string[]> = {
  de: stopword.deu,
  en: stopword.eng,
  es: stopword.spa,
  fr: stopword.fra,
  it: stopword.ita,
  pt: stopword.por,
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function extractWords(text: string, lang: string): string[] {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'word' })
  const stopwords = new Set(STOPWORD_MAP[lang] ?? stopword.eng)
  const words: string[] = []

  for (const segment of segmenter.segment(text)) {
    if (!segment.isWordLike) {
      continue
    }

    const word = segment.segment.toLowerCase().trim()
    if (word.length < 3 || /\d/.test(word) || stopwords.has(word)) {
      continue
    }

    words.push(word)
  }

  return words
}

export async function buildFlashcardsCsv(
  paragraphs: string[],
  language: string,
  provider: TranslationProvider,
): Promise<string> {
  const counts = new Map<string, number>()
  const config = getConfig()

  for (const paragraph of paragraphs) {
    for (const word of extractWords(paragraph, language)) {
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }

  const topWords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, config.maxFlashcards)
    .map(([word]) => word)

  if (topWords.length === 0) {
    return 'word,translation\n'
  }

  const translations = await provider.translateBatch(topWords, {
    srcLang: language,
    tgtLang: 'en',
  })

  const rows = ['word,translation']
  for (let index = 0; index < topWords.length; index += 1) {
    rows.push(`${csvEscape(topWords[index])},${csvEscape(translations[index])}`)
  }

  return rows.join('\n')
}
