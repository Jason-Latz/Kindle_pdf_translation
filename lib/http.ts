import { NextResponse } from 'next/server'

export function errorResponse(detail: string, status: number): NextResponse {
  return NextResponse.json({ detail }, { status })
}
