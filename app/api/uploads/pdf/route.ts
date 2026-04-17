import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

import { getConfig, requireBlobToken } from '@/lib/config'
import { validateUploadPath } from '@/lib/validation'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const config = getConfig()
    const response = await handleUpload({
      token: requireBlobToken(),
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        validateUploadPath(pathname)
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: config.maxPdfBytes,
          addRandomSuffix: false,
          allowOverwrite: false,
        }
      },
    })

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : 'Unable to authorize upload',
      },
      { status: 400 },
    )
  }
}
