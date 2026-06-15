function toErrorMessage(error: unknown, fallback = 'Workflow failed'): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}

async function updateJobRecordStep(
  jobId: string,
  patch: {
    status?: 'processing' | 'done' | 'error'
    stage?: 'parse_pdf' | 'translate' | 'build_epub' | 'flashcards' | 'finalize' | 'done' | 'error'
    pct?: number
    error?: string | null
    epubBlobPath?: string | null
    flashcardsBlobPath?: string | null
  },
) {
  'use step'

  const { updateJobRecord } = await import('@/lib/jobs')
  await updateJobRecord(jobId, patch)
}

async function parsePdfStep(jobId: string) {
  'use step'

  const [{ getJobRecord }, { readPrivateBlob }, { extractBookFromPdf }] = await Promise.all([
    import('@/lib/jobs'),
    import('@/lib/blob'),
    import('@/lib/pdf'),
  ])

  const job = await getJobRecord(jobId)
  if (!job) {
    throw new Error(`Job '${jobId}' was not found`)
  }

  const pdfBytes = await readPrivateBlob(job.source_blob_path)
  const extracted = await extractBookFromPdf(pdfBytes, job.filename)

  // Extracted paragraphs ride to the translate step as the durable step
  // return value (journaled by the Workflow runtime) rather than a Blob
  // round-trip — same crash/resume guarantee, one fewer advanced Blob op.
  return {
    paragraphs: extracted.paragraphs,
    title: extracted.title,
    author: extracted.author,
    pageCount: extracted.pageCount,
  }
}

async function translateStep(jobId: string, paragraphs: string[]) {
  'use step'

  const [{ getJobRecord }, { getTranslationProvider }] = await Promise.all([
    import('@/lib/jobs'),
    import('@/lib/providers'),
  ])

  const job = await getJobRecord(jobId)
  if (!job) {
    throw new Error(`Job '${jobId}' was not found`)
  }

  const provider = getTranslationProvider()
  const translations = await provider.translateBatch(paragraphs, {
    srcLang: 'auto',
    tgtLang: job.target_lang,
  })

  // Translated paragraphs feed both the epub and flashcards steps; hand
  // them over as the durable step return value instead of writing
  // translations.json to Blob (one fewer advanced op, two fewer reads).
  return {
    translations,
  }
}

async function buildEpubStep(jobId: string, translations: string[], title: string, author: string) {
  'use step'

  const [{ getJobRecord }, { putPrivateBlob }, { buildEpubBuffer }, { buildJobArtifactPath }] =
    await Promise.all([
      import('@/lib/jobs'),
      import('@/lib/blob'),
      import('@/lib/epub'),
      import('@/lib/utils'),
    ])

  const job = await getJobRecord(jobId)
  if (!job) {
    throw new Error(`Job '${jobId}' was not found`)
  }

  const epubBuffer = await buildEpubBuffer(translations, {
    title,
    author,
    language: job.target_lang,
  })

  const epubPath = buildJobArtifactPath(job.id, `${job.filename.replace(/\.pdf$/i, '')}.epub`)
  await putPrivateBlob(epubPath, epubBuffer, 'application/epub+zip')

  return {
    epubPath,
  }
}

async function buildFlashcardsStep(jobId: string, translations: string[]) {
  'use step'

  const [{ getJobRecord }, { putPrivateBlob }, { getTranslationProvider }, { buildFlashcardsCsv }, { buildJobArtifactPath }] =
    await Promise.all([
      import('@/lib/jobs'),
      import('@/lib/blob'),
      import('@/lib/providers'),
      import('@/lib/flashcards'),
      import('@/lib/utils'),
    ])

  const job = await getJobRecord(jobId)
  if (!job) {
    throw new Error(`Job '${jobId}' was not found`)
  }

  const provider = getTranslationProvider()
  const csv = await buildFlashcardsCsv(translations, job.target_lang, provider)

  const flashcardsPath = buildJobArtifactPath(job.id, `${job.filename.replace(/\.pdf$/i, '')}.csv`)
  await putPrivateBlob(flashcardsPath, csv, 'text/csv')

  return {
    flashcardsPath,
  }
}

export async function translateBookWorkflow(jobId: string) {
  'use workflow'

  try {
    await updateJobRecordStep(jobId, {
      status: 'processing',
      stage: 'parse_pdf',
      pct: 10,
      error: null,
    })
    const parsed = await parsePdfStep(jobId)

    await updateJobRecordStep(jobId, {
      status: 'processing',
      stage: 'translate',
      pct: 35,
      error: null,
    })
    const translated = await translateStep(jobId, parsed.paragraphs)

    await updateJobRecordStep(jobId, {
      status: 'processing',
      stage: 'build_epub',
      pct: 75,
      error: null,
    })
    const epub = await buildEpubStep(jobId, translated.translations, parsed.title, parsed.author)

    await updateJobRecordStep(jobId, {
      status: 'processing',
      stage: 'flashcards',
      pct: 90,
      error: null,
    })
    const flashcards = await buildFlashcardsStep(jobId, translated.translations)

    await updateJobRecordStep(jobId, {
      status: 'processing',
      stage: 'finalize',
      pct: 98,
      error: null,
      epubBlobPath: epub.epubPath,
      flashcardsBlobPath: flashcards.flashcardsPath,
    })

    await updateJobRecordStep(jobId, {
      status: 'done',
      stage: 'done',
      pct: 100,
      error: null,
    })

    return {
      jobId,
      pageCount: parsed.pageCount,
    }
  } catch (error) {
    await updateJobRecordStep(jobId, {
      status: 'error',
      stage: 'error',
      error: toErrorMessage(error),
    })
    throw error
  }
}
