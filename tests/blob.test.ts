import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.hoisted(() => vi.fn())
const headMock = vi.hoisted(() => vi.fn())
const putMock = vi.hoisted(() => vi.fn())

vi.mock('@vercel/blob', () => ({ get: getMock, head: headMock, put: putMock }))

async function loadBlob() {
  vi.resetModules()
  return import('@/lib/blob')
}

function streamOf(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

beforeEach(() => {
  getMock.mockReset()
  headMock.mockReset()
  putMock.mockReset()
  process.env.BLOB_READ_WRITE_TOKEN = 'blob-token'
})

afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN
})

describe('blob helpers', () => {
  it('readPrivateBlob fetches a private blob with the token and returns its bytes', async () => {
    getMock.mockResolvedValue({ statusCode: 200, stream: streamOf('hello') })
    const { readPrivateBlob } = await loadBlob()

    const buffer = await readPrivateBlob('artifacts/a/book.epub')

    expect(buffer.toString()).toBe('hello')
    expect(getMock).toHaveBeenCalledWith('artifacts/a/book.epub', {
      access: 'private',
      token: 'blob-token',
    })
  })

  it('throws when the blob is missing (non-200)', async () => {
    getMock.mockResolvedValue({ statusCode: 404 })
    const { readPrivateBlob } = await loadBlob()

    await expect(readPrivateBlob('missing')).rejects.toThrow(/was not found/)
  })

  it('putPrivateBlob writes privately, without a random suffix, with the content type', async () => {
    putMock.mockResolvedValue({})
    const { putPrivateBlob } = await loadBlob()

    await putPrivateBlob('artifacts/a/book.csv', 'a,b\n', 'text/csv')

    expect(putMock).toHaveBeenCalledWith(
      'artifacts/a/book.csv',
      'a,b\n',
      expect.objectContaining({
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'text/csv',
        token: 'blob-token',
      }),
    )
  })

  it('headBlob passes the token', async () => {
    headMock.mockResolvedValue({ contentType: 'application/pdf', size: 10 })
    const { headBlob } = await loadBlob()

    const meta = await headBlob('source/x.pdf')

    expect(meta).toEqual({ contentType: 'application/pdf', size: 10 })
    expect(headMock).toHaveBeenCalledWith('source/x.pdf', { token: 'blob-token' })
  })
})
