"use client";

import React from "react";

export type ProgressEvent = {
  stage: string;
  pct: number;
  detail?: string;
};

type Props = {
  events: ProgressEvent[];
};

const stageLabels: Record<string, string> = {
  pending: "Pending",
  parse_pdf: "Parsing PDF",
  detect_chapters: "Detecting chapters",
  extract_paragraphs: "Extracting paragraphs",
  translate: "Translating",
  assemble_epub: "Assembling EPUB",
  build_flashcards: "Building flashcards",
  finalize: "Finalizing",
};

export default function ProgressFeed({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">Waiting for progress updates…</p>;
  }

  return (
    <ul className="space-y-2">
      {events.map((event, index) => (
        <li key={`${event.stage}-${index}`} className="rounded-md bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-sm font-medium text-slate-700">
            <span>{stageLabels[event.stage] ?? event.stage}</span>
            <span>{event.pct}%</span>
          </div>
          {event.detail && <p className="mt-1 text-sm text-slate-500">{event.detail}</p>}
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-200">
            <div className="h-2 bg-indigo-500" style={{ width: `${event.pct}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
