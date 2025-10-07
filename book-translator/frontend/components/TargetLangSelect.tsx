"use client";

import React from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const LANG_OPTIONS = [
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
];

export default function TargetLangSelect({ value, onChange }: Props) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      Target language
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      >
        {LANG_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
