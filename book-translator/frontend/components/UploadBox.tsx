"use client";

import React, { useState } from "react";
import TargetLangSelect from "./TargetLangSelect";

type Props = {
  onSubmit: (file: File, targetLanguage: string) => Promise<void>;
};

export default function UploadBox({ onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Select a PDF file to upload.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(file, targetLanguage);
    } catch (err) {
      console.error(err);
      setError("Upload failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 shadow-sm">
      <div>
        <label className="block text-sm font-medium text-slate-700">Select a PDF</label>
        <input
          type="file"
          accept="application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="mt-2 w-full text-sm"
        />
      </div>
      <TargetLangSelect value={targetLanguage} onChange={setTargetLanguage} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        {isSubmitting ? "Uploading..." : "Upload and translate"}
      </button>
    </form>
  );
}
