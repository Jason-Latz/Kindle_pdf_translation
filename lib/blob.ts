import { get, head, put } from '@vercel/blob'

import { getConfig, requireBlobToken } from '@/lib/config'

async function requireBlob(pathname: string) {
  const blob = await get(pathname, {
    access: 'private',
    token: requireBlobToken(),
  })

  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    throw new Error(`Blob '${pathname}' was not found`)
  }

  return blob
}

export async function readPrivateBlob(pathname: string): Promise<Buffer> {
  const blob = await requireBlob(pathname)
  const arrayBuffer = await new Response(blob.stream).arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function headBlob(pathname: string) {
  return head(pathname, {
    token: requireBlobToken(),
  })
}

export async function downloadPrivateBlob(pathname: string) {
  return requireBlob(pathname)
}

export async function putPrivateBlob(pathname: string, body: string | Buffer, contentType: string) {
  return put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: requireBlobToken(),
    contentType,
    maximumSizeInBytes: getConfig().maxPdfBytes,
  })
}
