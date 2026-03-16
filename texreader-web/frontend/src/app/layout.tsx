import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import SiteName from "@/components/SiteName";
import HeaderSearchBar from "@/components/HeaderSearchBar";
import HeaderPlayer from "@/components/HeaderPlayer";
import PlaylistNavButton from "@/components/PlaylistNavButton";
import FlyToPlaylist from "@/components/FlyToPlaylist";
import { AudioProvider } from "@/contexts/AudioContext";
import { PlaylistProvider } from "@/contexts/PlaylistContext";

export const metadata: Metadata = {
  title: "unarXiv — Listen to Research Papers",
  description:
    "Browse and listen to narrated research papers from arXiv. Submit any paper for audio narration.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-gray-900 min-h-screen antialiased">
        <AudioProvider>
        <PlaylistProvider>
        <FlyToPlaylist />
        <header className="border-b border-stone-200/60 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center">
            {/* Left: logo — fixed width so center column stays centered */}
            <div className="flex items-center gap-3 shrink-0">
              <Link href="/" className="flex items-center gap-2 no-underline text-stone-900 hover:text-stone-600 transition-colors">
                <svg width="28" height="28" viewBox="0 0 30 30" fill="none" stroke="#44403c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 11v14a2 2 0 002 2h18a2 2 0 002-2V11" />
                  <path d="M4 11l-2.25-4.5" />
                  <path d="M26 11l2.25-4.5" />
                  <g transform="translate(15,19) rotate(-90)">
                    <polygon points="0,-3.5 0,3.5 2.5,3.5 5,6 5,-6 2.5,-3.5" fill="#44403c" stroke="none" />
                    <path d="M7,-2.5a3.5 3.5 0 010 5" fill="none" stroke="#44403c" strokeWidth="1.5" />
                    <path d="M9,-4.5a6 6 0 010 9" fill="none" stroke="#44403c" strokeWidth="1.5" />
                  </g>
                </svg>
                <SiteName className="text-lg tracking-tight" />
              </Link>
            </div>
            {/* Center: player (desktop only) — flex-1 centers it between logo and playlist */}
            <div className="hidden md:flex flex-1 justify-center">
              <HeaderPlayer inline />
            </div>
            {/* Right: playlist button */}
            <div className="flex items-center gap-3 shrink-0 ml-auto md:ml-0">
              <PlaylistNavButton />
            </div>
          </div>
          {/* Mobile: player below header content, still inside sticky header */}
          <div className="md:hidden">
            <HeaderPlayer />
          </div>
        </header>
        <HeaderSearchBar />
        <main className="max-w-5xl mx-auto px-6 py-4">{children}</main>
        <footer className="w-full py-6">
          <div className="max-w-5xl mx-auto px-6 flex items-end justify-between">
            <Link
              href="/about"
              className="text-sm text-stone-400 hover:text-stone-600 transition-colors no-underline"
            >
              About
            </Link>
            <div className="text-right">
              <p className="text-[11px] text-stone-400 mb-1">Launched Mar 15 2026</p>
              <p className="text-[11px] text-stone-400 max-w-md">
                arXiv is a registered trademark of Cornell University. unarXiv is not affiliated with, endorsed by, or sponsored by Cornell University or arXiv.
              </p>
            </div>
          </div>
        </footer>
        <a
          href="/admin"
          className="fixed bottom-4 right-4 z-40 text-stone-300 hover:text-stone-400 transition-colors"
          title="Admin"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </a>
        </PlaylistProvider>
        </AudioProvider>
      </body>
    </html>
  );
}
