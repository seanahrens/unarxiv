import type { Metadata } from "next";
import { Quicksand, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import SiteName from "@/components/SiteName";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-brand",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono-brand",
});

import HeaderPlayer from "@/components/HeaderPlayer";
import PlaylistNavButton from "@/components/PlaylistNavButton";
import FlyToPlaylist from "@/components/FlyToPlaylist";
import { Suspense } from "react";
import { AudioProvider } from "@/contexts/AudioContext";
import { PlaylistProvider } from "@/contexts/PlaylistContext";
import { NavigationHistoryProvider } from "@/contexts/NavigationHistoryContext";

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
    <html lang="en" className={`${quicksand.variable} ${ibmPlexMono.variable}`}>
      <body className="bg-stone-100 text-stone-900 min-h-screen antialiased">
        <AudioProvider>
        <PlaylistProvider>
        <Suspense>
        <NavigationHistoryProvider>
        <FlyToPlaylist />
        <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center">
            {/* Left: logo — fixed width so center column stays centered */}
            <div className="flex items-center gap-3 shrink-0">
              <Link href="/" className="flex items-center gap-1 no-underline text-stone-900 transition-colors">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="self-center">
                  <path fillRule="evenodd" clipRule="evenodd" d="M 11 5.414 L 11 15 C 11 15.552 11.448 16 12 16 C 12.552 16 13 15.552 13 15 L 13 5.414 L 15.293 7.707 C 15.683 8.098 16.317 8.098 16.707 7.707 C 17.098 7.317 17.098 6.683 16.707 6.293 L 12.707 2.293 C 12.317 1.902 11.683 1.902 11.293 2.293 L 7.293 6.293 C 6.902 6.683 6.902 7.317 7.293 7.707 C 7.683 8.098 8.317 8.098 8.707 7.707 L 11 5.414 Z M 4 4 C 4 4 3.447 4.077 3.253 4.398 C 2.998 4.819 3 6 3 6 L 3 17 C 3 18.657 4.343 20 6 20 L 18 20 C 19.657 20 21 18.657 21 17 L 21 6 C 21 6 21.08 4.713 20.704 4.26 C 20.544 4.068 20 4 20 4 C 19.448 4 19 4.448 19 5 L 19 17 C 19 17.552 18.552 18 18 18 L 6 18 C 5.448 18 5 17.552 5 17 L 5 5 C 5 4.448 4.552 4 4 4 Z" fill="#292524"/>
                </svg>
                <SiteName className="text-lg tracking-tight" />
              </Link>
            </div>
            {/* Center: player (desktop only) — flex-1 centers it between logo and playlist */}
            <div className="hidden md:flex flex-1 min-w-0 px-5">
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
              <p className="text-2xs text-stone-500 max-w-md">
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
        </NavigationHistoryProvider>
        </Suspense>
        </PlaylistProvider>
        </AudioProvider>
      </body>
    </html>
  );
}
