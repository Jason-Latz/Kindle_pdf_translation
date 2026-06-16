import { beforeEach, describe, expect, it, vi } from 'vitest'

const jobs = vi.hoisted(() => ({
  getJobRecord: vi.fn(),
  updateJobRecord: vi.fn(),
}))
const blob = vi.hoisted(() => ({
  readPrivateBlob: vi.fn(),
  putPrivateBlob: vi.fn(),
}))
const pdf = vi.hoisted(() => ({ extractBookFromPdf: vi.fn() }))
const providers = vi.hoisted(() => ({ getTranslationProvider: vi.fn() }))
const epub = vi.hoisted(() => ({ buildEpubBuffer: vi.fn() }))
const flashcards = vi.hoisted(() => ({ buildFlashcardsCsv: vi.fn() }))
const utils = vi.hoisted(() => ({
  buildJobArtifactPath: vi.fn((id: string, name: string) => `artifacts/${id}/${name}`),
}))

vi.mock('@/lib/jobs', () => jobs)
vi.mock('@/lib/blob', () => blob)
vi.mock('@/lib/pdf', () => pdf)
vi.mock('@/lib/providers', () => providers)
vi.mock('@/lib/epub', () => epub)
vi.mock('@/lib/flashcards', () => flashcards)
vi.mock('@/lib/utils', () => utils)

import { translateBookWorkflow } from '@/lib/workflows/translate-book'

const translateBatch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  jobs.getJobRecord.mockResolvedValue({
    id: 'job1',
    filename: 'My Book.pdf',
    source_blob_path: 'source/x.pdf',
    target_lang: 'es',
  })
  jobs.updateJobRecord.mockResolvedValue({})
  blob.readPrivateBlob.mockResolvedValue(Buffer.from('pdf'))
  blob.putPrivateBlob.mockResolvedValue(undefined)
  pdf.extractBookFromPdf.mockResolvedValue({
    chapters: [
      { title: 'Chapter One', paragraphs: ['para one', 'para two'] },
      { title: 'Chapter Two', paragraphs: ['para three'] },
    ],
    title: 'My Book',
    author: 'Author',
    pageCount: 3,
  })
  translateBatch.mockImplementation(async (segments: string[]) => segments.map((s) => `T:${s}`))
  providers.getTranslationProvider.mockReturnValue({ id: 'openai', translateBatch })
  epub.buildEpubBuffer.mockResolvedValue(Buffer.from('epub'))
  flashcards.buildFlashcardsCsv.mockResolvedValue('word,translation,context\n')
  utils.buildJobArtifactPath.mockImplementation((id: string, name: string) => `artifacts/${id}/${name}`)
})

describe('translateBookWorkflow', () => {
  it('flattens chapters for translation and reassembles translated chapters for the EPUB', async () => {
    const result = await translateBookWorkflow('job1')

    // The whole book (each chapter's title + paragraphs) is translated in one
    // call, in order.
    expect(translateBatch).toHaveBeenCalledTimes(1)
    expect(translateBatch.mock.calls[0][0]).toEqual([
      'Chapter One',
      'para one',
      'para two',
      'Chapter Two',
      'para three',
    ])

    // The EPUB is built from the reassembled translated chapters.
    expect(epub.buildEpubBuffer).toHaveBeenCalledTimes(1)
    expect(epub.buildEpubBuffer.mock.calls[0][0]).toEqual([
      { title: 'T:Chapter One', paragraphs: ['T:para one', 'T:para two'] },
      { title: 'T:Chapter Two', paragraphs: ['T:para three'] },
    ])
    expect(epub.buildEpubBuffer.mock.calls[0][1]).toMatchObject({
      title: 'My Book',
      author: 'Author',
      language: 'es',
    })

    // Flashcards use the translated body paragraphs only (no chapter titles).
    expect(flashcards.buildFlashcardsCsv).toHaveBeenCalledTimes(1)
    expect(flashcards.buildFlashcardsCsv.mock.calls[0][0]).toEqual([
      'T:para one',
      'T:para two',
      'T:para three',
    ])

    expect(result).toEqual({ jobId: 'job1', pageCount: 3 })

    const stages = jobs.updateJobRecord.mock.calls.map((call) => call[1].stage).filter(Boolean)
    expect(stages).toEqual(['parse_pdf', 'translate', 'build_epub', 'flashcards', 'finalize', 'done'])
  })

  it('marks the job errored and rethrows when a step fails', async () => {
    pdf.extractBookFromPdf.mockRejectedValue(new Error('bad pdf'))

    await expect(translateBookWorkflow('job1')).rejects.toThrow(/bad pdf/)

    const errorCall = jobs.updateJobRecord.mock.calls.find((call) => call[1].status === 'error')
    expect(errorCall?.[1].error).toMatch(/bad pdf/)
    expect(epub.buildEpubBuffer).not.toHaveBeenCalled()
  })
})
