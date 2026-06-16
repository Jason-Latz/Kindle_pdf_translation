import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { buildEpubBuffer } from '@/lib/epub'

describe('buildEpubBuffer', () => {
  it('produces a non-empty EPUB (zip) buffer for chaptered content', async () => {
    const buffer = await buildEpubBuffer(
      [
        { title: 'Chapter One', paragraphs: ['Hola mundo.', 'Segundo parrafo.'] },
        { title: 'Chapter Two', paragraphs: ['Otro capitulo.'] },
      ],
      { title: 'Mi Libro', author: 'Autor', language: 'es' },
    )

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.byteLength).toBeGreaterThan(0)
    // EPUB is a ZIP container; ZIP files begin with the "PK" local-file header.
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('throws when there is no content', async () => {
    await expect(
      buildEpubBuffer([], { title: 'X', author: 'Y', language: 'es' }),
    ).rejects.toThrow(/no content/)

    await expect(
      buildEpubBuffer([{ title: 'Empty', paragraphs: [] }], {
        title: 'X',
        author: 'Y',
        language: 'es',
      }),
    ).rejects.toThrow(/no content/)
  })

  it('writes each chapter title and paragraph into the EPUB (chaptered + TOC)', async () => {
    const buffer = await buildEpubBuffer(
      [
        { title: 'Alpha Heading', paragraphs: ['first body line'] },
        { title: 'Beta Heading', paragraphs: ['second body line'] },
      ],
      { title: 'Book', author: 'A', language: 'en' },
    )

    const zip = await JSZip.loadAsync(buffer)
    const entries = await Promise.all(
      Object.values(zip.files).map((file) => file.async('text').catch(() => '')),
    )
    const allText = entries.join('\n')

    expect(allText).toContain('Alpha Heading')
    expect(allText).toContain('Beta Heading')
    expect(allText).toContain('first body line')
    expect(allText).toContain('second body line')
  })
})
