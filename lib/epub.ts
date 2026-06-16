import epub from 'epub-gen-memory'

import type { Chapter } from '@/lib/types'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function buildEpubBuffer(
  chapters: Chapter[],
  metadata: {
    title: string
    author: string
    language: string
  },
): Promise<Buffer> {
  if (chapters.length === 0 || chapters.every((chapter) => chapter.paragraphs.length === 0)) {
    throw new Error('Cannot build an EPUB with no content')
  }

  const content = chapters.map((chapter) => ({
    title: chapter.title,
    content: chapter.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n'),
  }))

  // epub-gen-memory builds a navigable TOC (nav.xhtml + toc.ncx) from the
  // chapter titles, and `prependChapterTitles` renders each title as a heading
  // at the top of its chapter — giving a Kindle-friendly chaptered book.
  return epub(
    {
      title: metadata.title,
      author: metadata.author,
      lang: metadata.language,
      tocTitle: 'Contents',
      prependChapterTitles: true,
      css: [
        'body { font-family: serif; line-height: 1.5; }',
        'h1 { text-align: center; margin-bottom: 1.5rem; }',
        'p { margin: 0 0 1rem; }',
      ].join(' '),
    },
    content,
  )
}
