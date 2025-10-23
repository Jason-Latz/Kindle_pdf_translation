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
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-slate-800/60 bg-slate-950/80 px-6 py-4 text-sm text-slate-400">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium text-slate-300">Jason Latz</span>
              <nav className="flex items-center gap-4">
                <a
                  href="https://github.com/Jason-Latz"
                  className="transition hover:text-sky-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
                <a
                  href="https://linkedin.com/in/jasonlatz"
                  className="transition hover:text-sky-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  LinkedIn
                </a>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
