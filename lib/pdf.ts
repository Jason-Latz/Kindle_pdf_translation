import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

import { getConfig } from '@/lib/config'
import type { ExtractedBook } from '@/lib/types'

const HEADER_RATIO = 0.12
const FOOTER_RATIO = 0.12
const MIN_REPEAT_RATIO = 0.6
const MIN_REPEAT_COUNT = 2

type TextLine = {
  pageIndex: number
  y: number
  text: string
  key: string
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

export async function extractBookFromPdf(pdfBytes: Uint8Array, filename: string): Promise<ExtractedBook> {
  const config = getConfig()

  if (pdfBytes.byteLength > config.maxPdfBytes) {
    throw new Error(
      `PDF size ${(pdfBytes.byteLength / (1024 * 1024)).toFixed(1)} MB exceeds ${(
        config.maxPdfBytes /
        (1024 * 1024)
      ).toFixed(0)} MB limit`,
    )
  }

  let document

  try {
    const loadingTask = getDocument({
      data: pdfBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    document = await loadingTask.promise
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (message.includes('password') || message.includes('encrypt')) {
      throw new Error('Encrypted PDFs are not supported')
    }
    throw new Error('Unable to open PDF for parsing')
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

    const grouped = new Map<number, Array<{ text: string; x: number; width: number }>>()

    for (const item of textContent.items) {
      if (!('str' in item)) {
        continue
      }

      const raw = String(item.str)
      if (!raw.trim()) {
        continue
      }

      const y = Math.round((viewport.height - item.transform[5]) / 2) * 2
      const bucket = grouped.get(y) ?? []
      bucket.push({
        text: raw,
        x: item.transform[4],
        width: item.width,
      })
      grouped.set(y, bucket)
    }

    const pageLines = [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, parts]) => ({
        pageIndex: index,
        y,
        text: joinLine(parts),
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
  const paragraphs = linesToParagraphs(bodyLines)

  if (paragraphs.length === 0) {
    throw new Error('The PDF appears to be image-only or empty')
  }

  return {
    paragraphs,
    pageCount,
    title,
    author,
  }
}
