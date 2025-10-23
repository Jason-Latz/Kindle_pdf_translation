'use client'

const LANG_OPTIONS = [
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
]

export type TargetLangSelectProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function TargetLangSelect({ value, onChange, disabled }: TargetLangSelectProps) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm">
      <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Target language</span>
      <div className="relative">
        <select
          className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        >
          {LANG_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-slate-900 text-slate-100">
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-500">
          ▼
        </span>
      </div>
    </label>
  )
}
