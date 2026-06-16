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
      new URL('./fixtures/elevator-pitch.pdf', import.meta.url),
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

  it('rejects malformed / non-pdf bytes with a clean error instead of crashing', async () => {
    vi.resetModules()
    const { extractBookFromPdf } = await import('../lib/pdf')

    await expect(
      extractBookFromPdf(Buffer.from('this is definitely not a pdf'), 'bad.pdf'),
    ).rejects.toThrow(/Unable to open PDF/)
  })

  it('maps an encrypted pdf to a clear, non-leaky error', async () => {
    vi.resetModules()
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      getDocument: () => ({
        promise: Promise.reject(new Error('No password given (PasswordException)')),
      }),
    }))
    vi.doMock('pdfjs-dist/legacy/build/pdf.worker.mjs', () => ({ WorkerMessageHandler: {} }))

    const { extractBookFromPdf } = await import('../lib/pdf')

    await expect(extractBookFromPdf(Buffer.from('x'), 'enc.pdf')).rejects.toThrow(
      /Encrypted PDFs are not supported/,
    )
  })

  it('rejects an image-only / no-text pdf cleanly', async () => {
    vi.resetModules()
    vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getMetadata: async () => ({ info: {} }),
          getPage: async () => ({
            getViewport: () => ({ height: 100 }),
            getTextContent: async () => ({ items: [] }),
          }),
        }),
      }),
    }))
    vi.doMock('pdfjs-dist/legacy/build/pdf.worker.mjs', () => ({ WorkerMessageHandler: {} }))

    const { extractBookFromPdf } = await import('../lib/pdf')

    await expect(extractBookFromPdf(Buffer.from('x'), 'scan.pdf')).rejects.toThrow(
      /does not contain extractable text/,
    )
  })
})
