'use client'

import { useRef, useState } from 'react'

export type UploadBoxProps = {
  onFileSelected: (file: File) => void
  disabled?: boolean
  selectedFileName?: string | null
}

export function UploadBox({ onFileSelected, disabled, selectedFileName }: UploadBoxProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    const file = files[0]
    if (file.type !== 'application/pdf') {
      // Allow the user to continue by forcing the extension check instead of MIME, but we keep guardrails.
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Please upload a PDF file.')
        return
      }
    }
    onFileSelected(file)
  }

  return (
    <div
      className={`relative flex min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-all duration-200 ${
        isDragActive ? 'border-sky-400 bg-slate-900/60 shadow-lg shadow-sky-500/20' : 'border-slate-700 bg-slate-900/40'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      onClick={() => {
        if (disabled) return
        fileInputRef.current?.click()
      }}
      onDragOver={(event) => {
        event.preventDefault()
        if (disabled) return
        setIsDragActive(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        if (disabled) return
        setIsDragActive(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        if (disabled) return
        setIsDragActive(false)
        handleFiles(event.dataTransfer.files)
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
        disabled={disabled}
      />

      <span className="rounded-full border border-slate-700 bg-slate-800 px-4 py-1 text-xs uppercase tracking-[0.3em] text-slate-400">
        Upload PDF
      </span>
      <h2 className="text-2xl font-semibold">Drag & drop your book</h2>
      <p className="max-w-md text-sm text-slate-300">
        We will translate your PDF into your chosen language and return an EPUB plus a spaced-repetition flashcard deck.
      </p>
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        <span>Supports PDFs up to 100MB / 600 pages</span>
      </div>
      {selectedFileName ? (
        <div className="rounded-lg bg-slate-800/70 px-4 py-2 text-sm text-slate-200">
          Selected: <span className="font-medium text-sky-300">{selectedFileName}</span>
        </div>
      ) : (
        <button
          type="button"
          className="rounded-full bg-sky-500/90 px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400"
          disabled={disabled}
        >
          Browse files
        </button>
      )}
    </div>
  )
}
