"use client";

import { useRouter } from "next/navigation";
import UploadBox from "../components/UploadBox";
import api from "../lib/api";

export default function HomePage() {
  const router = useRouter();

  const handleSubmit = async (file: File, targetLanguage: string) => {
    const response = await api.post("/api/books", {
      filename: file.name,
      content_type: file.type || "application/pdf",
      content_length: file.size,
      target_language: targetLanguage,
    });

    const { book_id, upload_url } = response.data as { book_id: number; upload_url: string };

    await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/pdf" },
      body: file,
    });

    await api.post(`/api/books/${book_id}/upload-complete`, { filename: file.name });

    router.push(`/job/${book_id}`);
  };

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Translate your book</h1>
        <p className="text-slate-600">
          Upload an English-language PDF and generate a translated EPUB plus flashcards in your chosen language.
        </p>
      </div>
      <UploadBox onSubmit={handleSubmit} />
    </section>
  );
}
