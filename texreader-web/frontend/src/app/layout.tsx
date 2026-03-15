import type { Metadata } from "next";
import "./globals.css";
import HeaderSearchBar from "@/components/HeaderSearchBar";

export const metadata: Metadata = {
  title: "unarXiv — Listen to Research Papers",
  description:
    "Browse and listen to narrated research papers from arXiv. Submit any paper for audio narration.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-gray-900 min-h-screen antialiased">
        <header className="border-b border-stone-200/60 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 no-underline text-stone-900 hover:text-stone-600 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-700">
                <polyline points="7 11 12 6 17 11" />
                <line x1="12" y1="6" x2="12" y2="18" />
                <path d="M20 21H4a2 2 0 0 1-2-2v-5h4l2 2h8l2-2h4v5a2 2 0 0 1-2 2z" />
              </svg>
              <span className="text-lg tracking-tight">
                <span className="font-bold underline">un</span><span className="font-medium">arXiv</span>
              </span>
            </a>
            <span className="text-xs text-stone-400 tracking-wide uppercase">
              Listen to research papers
            </span>
          </div>
        </header>
        <HeaderSearchBar />
        <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
        <footer className="fixed bottom-4 right-4">
          <a
            href="/admin"
            className="text-stone-300 hover:text-stone-400 transition-colors"
            title="Admin"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </a>
        </footer>
      </body>
    </html>
  );
}
