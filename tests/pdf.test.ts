import { readFile } from 'node:fs/promises'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('pdfjs-dist/legacy/build/pdf.mjs')
  vi.doUnmock('pdfjs-dist/legacy/build/pdf.worker.mjs')
})

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

  it('passes a shared Uint8Array view to pdfjs for Buffer uploads', async () => {
    vi.resetModules()

    let capturedData: Uint8Array | undefined

    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      getDocument: ({ data }: { data: Uint8Array }) => {
        capturedData = data

        return {
          promise: Promise.resolve({
            numPages: 1,
            getMetadata: async () => ({ info: {} }),
            getPage: async () => ({
              getViewport: () => ({ height: 100 }),
              getTextContent: async () => ({
                items: [
                  {
                    str: 'Hello world',
                    transform: [0, 0, 0, 0, 0, 50],
                    width: 40,
                  },
                ],
              }),
            }),
          }),
        }
      },
    }))
    vi.doMock('pdfjs-dist/legacy/build/pdf.worker.mjs', () => ({
      WorkerMessageHandler: {},
    }))

    const { extractBookFromPdf } = await import('../lib/pdf')
    const pdfBytes = Buffer.from('synthetic pdf payload')

    const book = await extractBookFromPdf(pdfBytes, 'synthetic.pdf')

    expect(book.paragraphs).toEqual(['Hello world'])
    expect(capturedData).toBeInstanceOf(Uint8Array)
    expect(Buffer.isBuffer(capturedData)).toBe(false)
    expect(capturedData?.buffer).toBe(pdfBytes.buffer)
    expect(capturedData?.byteOffset).toBe(pdfBytes.byteOffset)
    expect(capturedData?.byteLength).toBe(pdfBytes.byteLength)
  })
})
