import '../styles/globals.css'
import type { Metadata } from 'next'
import { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Book Translator',
  description:
    'Upload a PDF and receive a translated EPUB plus flashcard deck powered by the Book Translator pipeline.',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  )
}
