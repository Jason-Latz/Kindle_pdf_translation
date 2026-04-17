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

  const [{ getJobRecord }, { readPrivateBlob, putPrivateBlob }, { extractBookFromPdf }, { buildJobArtifactPath }] =
    await Promise.all([
      import('@/lib/jobs'),
      import('@/lib/blob'),
      import('@/lib/pdf'),
      import('@/lib/utils'),
    ])

  const job = await getJobRecord(jobId)
  if (!job) {
    throw new Error(`Job '${jobId}' was not found`)
  }

  const pdfBytes = await readPrivateBlob(job.source_blob_path)
  const extracted = await extractBookFromPdf(pdfBytes, job.filename)
  const paragraphsPath = buildJobArtifactPath(job.id, 'paragraphs.json')

  await putPrivateBlob(
    paragraphsPath,
    JSON.stringify(
      {
        paragraphs: extracted.paragraphs,
      },
      null,
      2,
    ),
    'application/json',
  )

  return {
    paragraphsPath,
    title: extracted.title,
    author: extracted.author,
    pageCount: extracted.pageCount,
  }
}

async function translateStep(jobId: string, paragraphsPath: string) {
  'use step'

  const [{ getJobRecord }, { readPrivateBlob, putPrivateBlob }, { getTranslationProvider }, { buildJobArtifactPath }] =
    await Promise.all([
      import('@/lib/jobs'),
      import('@/lib/blob'),
      import('@/lib/providers'),
      import('@/lib/utils'),
    ])

  const job = await getJobRecord(jobId)
  if (!job) {
    throw new Error(`Job '${jobId}' was not found`)
  }

  const source = JSON.parse((await readPrivateBlob(paragraphsPath)).toString('utf-8')) as {
    paragraphs: string[]
  }

  const provider = getTranslationProvider()
  const translations = await provider.translateBatch(source.paragraphs, {
    srcLang: 'auto',
    tgtLang: job.target_lang,
  })

  const translationsPath = buildJobArtifactPath(job.id, 'translations.json')
  await putPrivateBlob(
    translationsPath,
    JSON.stringify(
      {
        paragraphs: translations,
      },
      null,
      2,
    ),
    'application/json',
  )

  return {
    translationsPath,
  }
}

async function buildEpubStep(jobId: string, translationsPath: string, title: string, author: string) {
  'use step'

  const [{ getJobRecord }, { readPrivateBlob, putPrivateBlob }, { buildEpubBuffer }, { buildJobArtifactPath }] =
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

  const source = JSON.parse((await readPrivateBlob(translationsPath)).toString('utf-8')) as {
    paragraphs: string[]
  }
  const epubBuffer = await buildEpubBuffer(source.paragraphs, {
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

async function buildFlashcardsStep(jobId: string, translationsPath: string) {
  'use step'

  const [{ getJobRecord }, { readPrivateBlob, putPrivateBlob }, { getTranslationProvider }, { buildFlashcardsCsv }, { buildJobArtifactPath }] =
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

  const source = JSON.parse((await readPrivateBlob(translationsPath)).toString('utf-8')) as {
    paragraphs: string[]
  }
  const provider = getTranslationProvider()
  const csv = await buildFlashcardsCsv(source.paragraphs, job.target_lang, provider)

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
    const translated = await translateStep(jobId, parsed.paragraphsPath)

    await updateJobRecordStep(jobId, {
      status: 'processing',
      stage: 'build_epub',
      pct: 75,
      error: null,
    })
    const epub = await buildEpubStep(jobId, translated.translationsPath, parsed.title, parsed.author)

    await updateJobRecordStep(jobId, {
      status: 'processing',
      stage: 'flashcards',
      pct: 90,
      error: null,
    })
    const flashcards = await buildFlashcardsStep(jobId, translated.translationsPath)

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
