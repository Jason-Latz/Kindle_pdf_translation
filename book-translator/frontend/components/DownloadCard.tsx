"use client";

import React from "react";

type DownloadLink = {
  type: string;
  url: string;
};

type Props = {
  links: DownloadLink[];
};

const LABELS: Record<string, string> = {
  original_pdf: "Original PDF",
  translated_epub: "Translated EPUB",
  flashcards_csv: "Flashcards CSV",
};

export default function DownloadCard({ links }: Props) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">Downloads</h2>
      <ul className="mt-4 space-y-2">
        {links.map((link) => (
          <li key={link.type}>
            <a
              href={link.url}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
              target="_blank"
              rel="noreferrer"
            >
              {LABELS[link.type] ?? link.type}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
