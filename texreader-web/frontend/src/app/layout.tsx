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
                <svg width="28" height="28" viewBox="0 0 32 32" fill="#292524">
                  <path d="M30.236 12.816c-0.003-0.021-0.017-0.037-0.021-0.057-0.053-0.173-0.115-0.321-0.19-0.461l0.007 0.014c-0.054-0.073-0.114-0.137-0.179-0.194l-0.001-0.001c-0.038-0.047-0.077-0.089-0.118-0.128l-0.001-0.001c-0.012-0.009-0.028-0.010-0.040-0.018-0.064-0.038-0.138-0.072-0.215-0.099l-0.009-0.003c-0.067-0.034-0.146-0.064-0.228-0.085l-0.008-0.002c-0.015-0.003-0.027-0.013-0.043-0.016l-8-1.23c-0.058-0.010-0.125-0.015-0.193-0.015-0.69 0-1.25 0.56-1.25 1.25 0 0.625 0.458 1.142 1.057 1.235l0.007 0.001 0.441 0.068-5.251 0.909-5.251-0.909 0.441-0.068c0.609-0.090 1.072-0.61 1.072-1.237 0-0.69-0.56-1.25-1.25-1.25-0.072 0-0.142 0.006-0.21 0.018l0.007-0.001-8 1.23c-0.017 0.003-0.029 0.014-0.046 0.017-0.084 0.022-0.157 0.050-0.226 0.083l0.007-0.003c-0.091 0.031-0.17 0.067-0.244 0.111l0.006-0.003c-0.012 0.008-0.028 0.009-0.040 0.018-0.042 0.040-0.081 0.082-0.117 0.126l-0.002 0.002c-0.067 0.058-0.126 0.122-0.178 0.192l-0.002 0.003c-0.035 0.057-0.067 0.124-0.093 0.194l-0.003 0.008c-0.035 0.070-0.065 0.151-0.086 0.236l-0.002 0.008c-0.004 0.021-0.018 0.037-0.021 0.058l-1 6.75c-0.009 0.055-0.013 0.119-0.013 0.183 0 0.602 0.425 1.104 0.991 1.223l0.008 0.001 1.001 0.205v7.315c0 0 0 0.001 0 0.001 0 0.635 0.474 1.16 1.089 1.239l0.006 0.001 12 1.506c0.047 0.006 0.101 0.010 0.155 0.010s0.109-0.004 0.162-0.010l-0.006 0.001 12.001-1.506c0.62-0.080 1.094-0.604 1.094-1.239 0-0 0-0.001 0-0.001v0-7.315l1-0.205c0.575-0.121 1-0.623 1-1.225 0-0.065-0.005-0.128-0.014-0.19l0.001 0.007zM27.951 14.45l0.639 4.312-8.855 1.813-1.94-4.366zM3.41 18.762l0.639-4.312 10.157 1.758-1.94 4.366zM5.25 21.691l7.499 1.534c0.074 0.016 0.16 0.025 0.248 0.025 0.507 0 0.944-0.301 1.143-0.734l0.003-0.008 0.607-1.367v7.442l-9.5-1.193zM26.75 27.391l-9.5 1.193v-7.442l0.607 1.367c0.2 0.441 0.636 0.742 1.143 0.742h0c0.001 0 0.002 0 0.002 0 0.088 0 0.173-0.009 0.256-0.027l-0.008 0.001 7.5-1.534zM15.014 11.137c0.23 0.254 0.56 0.413 0.928 0.413s0.699-0.159 0.927-0.412l0.001-0.001 3.591-3.982c0.808-0.746 1.312-1.81 1.312-2.991 0-0.337-0.041-0.665-0.119-0.979l0.006 0.028c-0.355-1.288-1.349-2.281-2.61-2.631l-0.026-0.006c-0.288-0.077-0.618-0.12-0.959-0.12-0.795 0-1.534 0.239-2.148 0.65l0.014-0.009c-0.546-0.333-1.206-0.53-1.912-0.53-1.049 0-1.996 0.435-2.671 1.135l-0.001 0.001c-0.707 0.68-1.146 1.633-1.146 2.69 0 1.083 0.461 2.058 1.198 2.739l0.002 0.002zM13.114 3.469c0.235-0.236 0.555-0.386 0.91-0.4l0.003-0c0.412 0.020 0.776 0.209 1.029 0.497l0.001 0.002c0.23 0.218 0.541 0.352 0.884 0.352s0.654-0.134 0.884-0.352l-0.001 0.001c0.303-0.368 0.759-0.602 1.27-0.602 0.1 0 0.197 0.009 0.292 0.026l-0.010-0.001c0.422 0.121 0.748 0.447 0.867 0.86l0.002 0.009c0.016 0.086 0.025 0.184 0.025 0.285 0 0.51-0.234 0.965-0.6 1.265l-0.003 0.002-0.043 0.047-2.684 2.976-2.729-3.022c-0.3-0.262-0.49-0.642-0.498-1.067l-0-0.001c0.020-0.344 0.169-0.651 0.399-0.874l0-0z" />
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
