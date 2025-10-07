"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DownloadCard from "../../../components/DownloadCard";
import ProgressFeed, { type ProgressEvent } from "../../../components/ProgressFeed";
import api from "../../../lib/api";
import { connectToSSE, type EventMessage } from "../../../lib/sse";

type BookResponse = {
  id: number;
  status: string;
  tgt_lang: string;
  files: { type: string; url: string }[];
};

export default function JobPage() {
  const params = useParams<{ id: string }>();
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [book, setBook] = useState<BookResponse | null>(null);

  useEffect(() => {
    const bookId = params?.id;
    if (!bookId) {
      return;
    }

    const fetchBook = async () => {
      const { data } = await api.get<BookResponse>(`/api/books/${bookId}`);
      setBook(data);
    };

    void fetchBook();

    const source = connectToSSE(`${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}/api/books/${bookId}/events`, (msg: EventMessage) => {
      setEvents((prev) => [...prev, { stage: msg.stage, pct: msg.pct, detail: msg.detail }]);
      if (msg.stage === "finalize" || msg.pct >= 100) {
        void fetchBook();
      }
    });

    return () => {
      source.close();
    };
  }, [params?.id]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Job #{params?.id}</h1>
        <p className="text-sm text-slate-600">Tracking translation progress and downloads.</p>
      </div>
      <ProgressFeed events={events} />
      {book && <DownloadCard links={book.files} />}
    </section>
  );
}
