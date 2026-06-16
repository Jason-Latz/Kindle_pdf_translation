import { getConfig } from '@/lib/config'

export type SupportedLanguage = {
  value: string
  label: string
}

// Display names only. The ENABLED set is whatever `TARGET_LANGS` resolves to in
// server config (`getConfig().targetLangs`) — this map merely supplies labels.
// Unknown codes fall back to their uppercased code, so adding a language to
// TARGET_LANGS can never break the UI or drift from server validation.
const LANGUAGE_LABELS: Record<string, string> = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  en: 'English',
  nl: 'Dutch',
}

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase()
}

export function getSupportedLanguages(): SupportedLanguage[] {
  return getConfig().targetLangs.map((value) => ({ value, label: languageLabel(value) }))
}
