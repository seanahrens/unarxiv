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

import PlayerBar from "@/components/PlayerBar";
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
            {/* Center: tagline */}
            <div className="flex-1 flex justify-center">
              <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1.5 m-0">
                <svg width="16" height="16" viewBox="0 0 640 640" fill="currentColor" className="flex-shrink-0 opacity-60">
                  <path d="M144 288C144 190.8 222.8 112 320 112C417.2 112 496 190.8 496 288L496 332.8C481.9 324.6 465.5 320 448 320L432 320C405.5 320 384 341.5 384 368L384 496C384 522.5 405.5 544 432 544L448 544C501 544 544 501 544 448L544 288C544 164.3 443.7 64 320 64C196.3 64 96 164.3 96 288L96 448C96 501 139 544 192 544L208 544C234.5 544 256 522.5 256 496L256 368C256 341.5 234.5 320 208 320L192 320C174.5 320 158.1 324.7 144 332.8L144 288zM144 416C144 389.5 165.5 368 192 368L208 368L208 496L192 496C165.5 496 144 474.5 144 448L144 416zM496 416L496 448C496 474.5 474.5 496 448 496L432 496L432 368L448 368C474.5 368 496 389.5 496 416z" />
                </svg>
                <span className="hidden md:inline">Listen to arXiv Papers. Unlimited. Free.</span>
                <span className="md:hidden">Listen to arXiv</span>
              </h2>
            </div>
            {/* Right: playlist button */}
            <div className="flex items-center gap-3 shrink-0">
              <PlaylistNavButton />
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-4">{children}</main>
        <footer className="w-full py-6">
          <div className="max-w-5xl mx-auto px-6 flex flex-col items-center text-center gap-1">
            <Link
              href="/about"
              className="text-sm text-stone-500 hover:text-stone-700 transition-colors no-underline"
            >
              About
            </Link>
            <p className="text-2xs text-stone-500 max-w-md">
              arXiv is a registered trademark of Cornell University. unarXiv is not affiliated with, endorsed by, or sponsored by Cornell University or arXiv.
            </p>
          </div>
        </footer>
        {/* Spacer so fixed player bar doesn't obscure content */}
        <div className="h-28 md:h-16" aria-hidden />
        <a
          href="/admin"
          className="hidden md:flex fixed bottom-20 right-4 z-40 w-9 h-9 items-center justify-center rounded-full bg-stone-200/80 hover:bg-stone-300 text-stone-500 hover:text-stone-700 transition-all shadow-sm backdrop-blur-sm no-underline"
          title="Admin"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
        </a>
        <PlayerBar />
        </NavigationHistoryProvider>
        </Suspense>
        </PlaylistProvider>
        </AudioProvider>
      </body>
    </html>
  );
}
