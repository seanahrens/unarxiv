import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import SiteName from "@/components/SiteName";

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
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "unarXiv",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-stone-100 text-stone-900 min-h-screen antialiased">
        <AudioProvider>
        <PlaylistProvider>
        <FlyToPlaylist />
        <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center">
            {/* Left: logo — fixed width so center column stays centered */}
            <div className="flex items-center gap-3 shrink-0">
              <Link href="/" className="flex items-center gap-2 no-underline text-stone-900 hover:text-stone-600 transition-colors">
                <svg width="28" height="28" viewBox="0 -960 960 960" fill="#292524">
                  <path d="M280-120q-66 0-113-47t-47-113v-400q0-66 47-113t113-47h400q66 0 113 47t47 113v400q0 66-47 113t-113 47H280Zm-80-360v200q0 33 23.5 56.5T280-200h400q33 0 56.5-23.5T760-280v-200h-80v80q0 33-23.5 56.5T600-320H360q-33 0-56.5-23.5T280-400v-80h-80Zm160 0v80h240v-80H360Zm-160-80h560v-120q0-33-23.5-56.5T680-760H280q-33 0-56.5 23.5T200-680v120Z" />
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
        <main className="max-w-5xl mx-auto px-6 py-4">{children}</main>
        <footer className="w-full py-6">
          <div className="max-w-5xl mx-auto px-6 flex items-start justify-between">
            <Link
              href="/about"
              className="text-sm text-stone-500 hover:text-stone-700 transition-colors no-underline"
            >
              About
            </Link>
            <div className="text-right">
              <p className="text-[11px] text-stone-500 mb-1">Launched Mar 15 2026</p>
              <p className="text-[11px] text-stone-500 max-w-md">
                arXiv is a registered trademark of Cornell University. unarXiv is not affiliated with, endorsed by, or sponsored by Cornell University or arXiv.
              </p>
            </div>
          </div>
        </footer>
        <a
          href="/admin"
          className="fixed bottom-4 right-4 z-40 text-stone-400 hover:text-stone-500 transition-colors"
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
