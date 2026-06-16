import { NextResponse } from 'next/server'

import { getSupportedLanguages } from '@/lib/languages'

export const runtime = 'nodejs'

// Single source of truth for the target languages the UI may offer: the same
// `TARGET_LANGS` config the create-job route validates against.
export function GET() {
  return NextResponse.json({ languages: getSupportedLanguages() })
}
