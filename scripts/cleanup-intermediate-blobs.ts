/**
 * One-time maintenance: delete orphaned intermediate workflow artifacts from
 * Vercel Blob.
 *
 * The translate pipeline used to persist `artifacts/<jobId>/paragraphs.json`
 * and `artifacts/<jobId>/translations.json` to Blob as step-to-step handoffs.
 * Those now ride through Workflow step return values, so blobs left behind by
 * pre-change jobs are dead weight (storage cost, never read again).
 *
 * Safe by construction: only blobs under the `artifacts/` prefix whose name is
 * exactly `paragraphs.json` or `translations.json` are matched. The `.epub` /
 * `.csv` deliverables and the `source/` PDFs can never match (different prefix
 * and/or extension). `del` is a free Blob operation.
 *
 * Usage (token comes from .env.local or the ambient environment):
 *   npm run cleanup:intermediate-blobs            # dry run — lists, deletes nothing
 *   npm run cleanup:intermediate-blobs -- --apply # actually delete
 */
import { del, list } from '@vercel/blob'

const INTERMEDIATE_NAME = /\/(?:paragraphs|translations)\.json$/

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not set. Run via `npm run cleanup:intermediate-blobs` ' +
        '(which loads .env.local) or export the token first.',
    )
  }

  const targets: string[] = []
  let scanned = 0
  let cursor: string | undefined

  do {
    const page = await list({ token, prefix: 'artifacts/', cursor })
    scanned += page.blobs.length
    for (const blob of page.blobs) {
      if (INTERMEDIATE_NAME.test(blob.pathname)) {
        targets.push(blob.pathname)
      }
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)

  console.log(
    `Scanned ${scanned} blob(s) under artifacts/; matched ${targets.length} intermediate artifact(s).`,
  )
  for (const pathname of targets) {
    console.log(`  ${apply ? 'delete' : 'would delete'}  ${pathname}`)
  }

  if (targets.length === 0) {
    console.log('Nothing to clean up.')
    return
  }

  if (!apply) {
    console.log('\nDry run — re-run with `-- --apply` to delete the matched blobs.')
    return
  }

  // del accepts an array of pathnames and is a free Blob operation.
  await del(targets, { token })
  console.log(`\nDeleted ${targets.length} intermediate blob(s).`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
