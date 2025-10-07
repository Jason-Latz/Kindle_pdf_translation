import "../styles/globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Book Translator",
  description: "Translate PDFs into multilingual EPUBs",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100">
        <main className="mx-auto max-w-3xl px-4 py-12">{children}</main>
      </body>
    </html>
  );
}
