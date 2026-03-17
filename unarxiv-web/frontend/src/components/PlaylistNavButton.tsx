"use client";

import Link from "next/link";
import { usePlaylist } from "@/contexts/PlaylistContext";

export default function PlaylistNavButton() {
  const { playlistCount, badgePulse } = usePlaylist();

  return (
    <Link
      id="playlist-nav-button"
      href="/playlist"
      className="inline-flex items-center gap-1.5 text-sm text-stone-700 hover:text-stone-900 hover:bg-stone-100 no-underline transition-colors relative border border-stone-300 rounded-full px-3 py-1.5"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
      <span className="font-semibold">My Lists</span>
    </Link>
  );
}
