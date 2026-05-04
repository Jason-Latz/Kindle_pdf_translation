import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

describe('extractBookFromPdf', () => {
  it('extracts paragraphs from a text-based pdf fixture', async () => {
    vi.resetModules()
    const { extractBookFromPdf } = await import('../lib/pdf')
    const pdfBytes = await readFile(
      new URL('../Elevator_Pitch.pdf', import.meta.url),
    )

    const book = await extractBookFromPdf(pdfBytes, 'Elevator_Pitch.pdf')

    expect(book.pageCount).toBeGreaterThan(0)
    expect(book.paragraphs.length).toBeGreaterThan(0)
    expect(book.title).toBeTruthy()
  })
})
