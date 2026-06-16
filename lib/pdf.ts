import { getConfig } from '@/lib/config'
import type { Chapter, ExtractedBook } from '@/lib/types'

const HEADER_RATIO = 0.12
const FOOTER_RATIO = 0.12
const MIN_REPEAT_RATIO = 0.6
const MIN_REPEAT_COUNT = 2
const HEADING_FONT_RATIO = 1.25
const HEADING_MAX_WORDS = 12
// Chapter-ish heading keywords across the supported languages.
const HEADING_KEYWORD =
  /^(chapter|chapitre|cap[ií]tulo|kapitel|capitolo|hoofdstuk|part|parte|partie|book|livre|libro|prologue|pr[oó]logo|epilogue|ep[ií]logo|introduction|introducci[oó]n|introduzione|conclusion|conclusione|conclusi[oó]n)\b/i

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
type PdfWorkerModule = typeof import('pdfjs-dist/legacy/build/pdf.worker.mjs')
type PdfWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler: PdfWorkerModule['WorkerMessageHandler']
  }
}

type TextLine = {
  pageIndex: number
  y: number
  text: string
  key: string
  fontSize: number
}

let pdfJsPromise: Promise<PdfJsModule> | null = null

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const [pdfjs, pdfWorker] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
      ])

      const globals = globalThis as PdfWorkerGlobal
      globals.pdfjsWorker ??= {
        WorkerMessageHandler: pdfWorker.WorkerMessageHandler,
      }

      return pdfjs
    })()
  }

  return pdfJsPromise
}

function toPlainUint8Array(bytes: Uint8Array): Uint8Array {
  if (bytes.constructor === Uint8Array) {
    return bytes
  }

  // Keep Buffer-backed uploads zero-copy while still giving pdfjs a plain Uint8Array.
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function normalizeKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function joinLine(parts: Array<{ text: string; x: number; width: number }>): string {
  const sorted = [...parts].sort((a, b) => a.x - b.x)
  let line = ''
  let previousEnd = 0

  for (const part of sorted) {
    const text = part.text.replace(/\s+/g, ' ').trim()
    if (!text) {
      continue
    }

    if (!line) {
      line = text
    } else {
      const gap = part.x - previousEnd
      const separator = gap > 4 ? ' ' : ''
      line = `${line}${separator}${text}`
    }

    previousEnd = part.x + part.width
  }

  return line.trim()
}

function linesToParagraphs(lines: TextLine[]): string[] {
  const paragraphs: string[] = []
  let current = ''
  let previousLine: TextLine | null = null

  for (const line of lines) {
    if (!line.text) {
      continue
    }

    const newParagraph =
      !previousLine ||
      line.pageIndex !== previousLine.pageIndex ||
      line.y - previousLine.y > 18

    if (newParagraph && current) {
      paragraphs.push(current.trim())
      current = ''
    }

    if (!current) {
      current = line.text
    } else if (current.endsWith('-') && /^[a-z]/.test(line.text)) {
      current = `${current.slice(0, -1)}${line.text}`
    } else {
      current = `${current} ${line.text}`
    }

    previousLine = line
  }

  if (current) {
    paragraphs.push(current.trim())
  }

  return paragraphs.filter(Boolean)
}

function detectChapters(lines: TextLine[], bookTitle: string): Chapter[] {
  // Body font size = the most common rounded size across the body; headings are
  // detected as notably larger lines or lines starting with a chapter keyword.
  const sizeCounts = new Map<number, number>()
  for (const line of lines) {
    const rounded = Math.round(line.fontSize)
    if (rounded > 0) {
      sizeCounts.set(rounded, (sizeCounts.get(rounded) ?? 0) + 1)
    }
  }

  let bodyFont = 0
  let bestCount = 0
  for (const [size, count] of sizeCounts) {
    if (count > bestCount) {
      bestCount = count
      bodyFont = size
    }
  }

  const isHeading = (line: TextLine): boolean => {
    const text = line.text.trim()
    if (!text || text.split(/\s+/).length > HEADING_MAX_WORDS) {
      return false
    }
    const largeFont = bodyFont > 0 && line.fontSize >= bodyFont * HEADING_FONT_RATIO
    return largeFont || HEADING_KEYWORD.test(text)
  }

  const grouped: Array<{ title: string; lines: TextLine[] }> = []
  const preface: TextLine[] = []
  for (const line of lines) {
    if (isHeading(line)) {
      grouped.push({ title: line.text.trim(), lines: [] })
    } else if (grouped.length === 0) {
      preface.push(line)
    } else {
      grouped[grouped.length - 1].lines.push(line)
    }
  }

  const chapters: Chapter[] = []
  const prefaceParagraphs = linesToParagraphs(preface)
  if (prefaceParagraphs.length > 0 && grouped.length > 0) {
    chapters.push({ title: bookTitle, paragraphs: prefaceParagraphs })
  }
  for (const chapter of grouped) {
    const paragraphs = linesToParagraphs(chapter.lines)
    if (paragraphs.length > 0) {
      chapters.push({ title: chapter.title, paragraphs })
    }
  }

  // Fall back to one flat chapter when detection found no usable structure
  // (no headings, or all false positives) — never worse than the old output.
  if (chapters.length < 2) {
    return [{ title: bookTitle, paragraphs: linesToParagraphs(lines) }]
  }

  return chapters
}

export async function extractBookFromPdf(pdfBytes: Uint8Array, filename: string): Promise<ExtractedBook> {
  const config = getConfig()
  const { getDocument } = await loadPdfJs()
  const pdfData = toPlainUint8Array(pdfBytes)

  if (pdfData.byteLength > config.maxPdfBytes) {
    throw new Error(
      `PDF size ${(pdfData.byteLength / (1024 * 1024)).toFixed(1)} MB exceeds ${(
        config.maxPdfBytes /
        (1024 * 1024)
      ).toFixed(0)} MB limit`,
    )
  }

  let document

  try {
    const loadingTask = getDocument({
      data: pdfData,
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    document = await loadingTask.promise
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : ''
    const normalizedMessage = rawMessage.toLowerCase()
    if (normalizedMessage.includes('password') || normalizedMessage.includes('encrypt')) {
      throw new Error('Encrypted PDFs are not supported')
    }
    throw new Error(`Unable to open PDF for parsing${rawMessage ? `: ${rawMessage}` : ''}`)
  }

  const pageCount = document.numPages
  if (pageCount === 0) {
    throw new Error('PDF contains no pages')
  }
  if (pageCount > config.maxPages) {
    throw new Error(`PDF has ${pageCount} pages which exceeds ${config.maxPages}`)
  }

  const headerCounts = new Map<string, number>()
  const footerCounts = new Map<string, number>()
  const allLines: TextLine[] = []

  let title = filename.replace(/\.pdf$/i, '')
  let author = 'Unknown Author'

  try {
    const metadata = await document.getMetadata()
    const info = (metadata?.info ?? {}) as Record<string, unknown>
    title = String(info.Title || info.title || title).trim() || title
    author = String(info.Author || info.author || author).trim() || author
  } catch {
    // Metadata is optional.
  }

  for (let index = 0; index < pageCount; index += 1) {
    const page = await document.getPage(index + 1)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()

    const grouped = new Map<number, Array<{ text: string; x: number; width: number; fontSize: number }>>()

    for (const item of textContent.items) {
      if (!('str' in item)) {
        continue
      }

      const raw = String(item.str)
      if (!raw.trim()) {
        continue
      }

      const y = Math.round((viewport.height - item.transform[5]) / 2) * 2
      const fontSize = Math.hypot(item.transform[2], item.transform[3]) || item.height || 0
      const bucket = grouped.get(y) ?? []
      bucket.push({
        text: raw,
        x: item.transform[4],
        width: item.width,
        fontSize,
      })
      grouped.set(y, bucket)
    }

    const pageLines = [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, parts]) => ({
        pageIndex: index,
        y,
        text: joinLine(parts),
        fontSize: parts.reduce((max, part) => Math.max(max, part.fontSize), 0),
      }))
      .filter((line) => line.text)

    const headerCutoff = viewport.height * HEADER_RATIO
    const footerCutoff = viewport.height * (1 - FOOTER_RATIO)
    const pageHeaders = new Set<string>()
    const pageFooters = new Set<string>()

    for (const line of pageLines) {
      const key = normalizeKey(line.text)
      const nextLine: TextLine = { ...line, key }
      allLines.push(nextLine)

      if (line.y <= headerCutoff) {
        pageHeaders.add(key)
      }
      if (line.y >= footerCutoff) {
        pageFooters.add(key)
      }
    }

    for (const key of pageHeaders) {
      headerCounts.set(key, (headerCounts.get(key) ?? 0) + 1)
    }
    for (const key of pageFooters) {
      footerCounts.set(key, (footerCounts.get(key) ?? 0) + 1)
    }
  }

  if (allLines.length === 0) {
    throw new Error('The PDF does not contain extractable text content')
  }

  const repeatThreshold =
    pageCount >= MIN_REPEAT_COUNT ? Math.max(MIN_REPEAT_COUNT, Math.floor(pageCount * MIN_REPEAT_RATIO)) : 0

  const repeatedHeaders = new Set(
    [...headerCounts.entries()].filter(([, count]) => count >= repeatThreshold).map(([key]) => key),
  )
  const repeatedFooters = new Set(
    [...footerCounts.entries()].filter(([, count]) => count >= repeatThreshold).map(([key]) => key),
  )

  const bodyLines = allLines.filter(
    (line) => !repeatedHeaders.has(line.key) && !repeatedFooters.has(line.key),
  )
  const chapters = detectChapters(bodyLines, title)
  const totalParagraphs = chapters.reduce((sum, chapter) => sum + chapter.paragraphs.length, 0)

  if (totalParagraphs === 0) {
    throw new Error('The PDF appears to be image-only or empty')
  }

  return {
    chapters,
    pageCount,
    title,
    author,
  }
}
