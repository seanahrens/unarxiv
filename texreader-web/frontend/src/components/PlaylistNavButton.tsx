"use client";

import Link from "next/link";
import { ListPlus } from "lucide-react";
import { usePlaylist } from "@/contexts/PlaylistContext";

export default function PlaylistNavButton() {
  const { playlistCount, badgePulse } = usePlaylist();

  return (
    <Link
      id="playlist-nav-button"
      href="/playlist"
      className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 no-underline transition-colors relative"
    >
      <ListPlus size={16} />
      <span className="hidden md:inline">My Playlist</span>
      {playlistCount > 0 && (
        <span
          className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-stone-700 rounded-full transition-transform ${
            badgePulse ? "scale-125" : "scale-100"
          }`}
        >
          {playlistCount}
        </span>
      )}
    </Link>
  );
}
