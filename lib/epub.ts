import epub from 'epub-gen-memory'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function buildEpubBuffer(
  paragraphs: string[],
  metadata: {
    title: string
    author: string
    language: string
  },
): Promise<Buffer> {
  if (paragraphs.length === 0) {
    throw new Error('Cannot build an EPUB with no content')
  }

  const chapterHtml = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')

  return epub(
    {
      title: metadata.title,
      author: metadata.author,
      lang: metadata.language,
      css: [
        'body { font-family: serif; line-height: 1.5; }',
        'h1 { text-align: center; margin-bottom: 1.5rem; }',
        'p { margin: 0 0 1rem; }',
      ].join(' '),
    },
    [
      {
        title: metadata.title,
        content: `<h1>${escapeHtml(metadata.title)}</h1>${chapterHtml}`,
      },
    ],
  )
}
