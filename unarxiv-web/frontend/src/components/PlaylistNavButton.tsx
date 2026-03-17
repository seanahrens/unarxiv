"use client";

import { usePathname, useRouter } from "next/navigation";
import { usePlaylist } from "@/contexts/PlaylistContext";

export default function PlaylistNavButton() {
  const { playlistCount, badgePulse } = usePlaylist();
  const pathname = usePathname();
  const router = useRouter();
  const isOnPlaylist = pathname === "/playlist" || pathname === "/playlist/";

  const handleClick = () => {
    if (isOnPlaylist) {
      // Toggle off: go back to wherever the user came from
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    } else {
      router.push("/playlist");
    }
  };

  return (
    <button
      id="playlist-nav-button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-sm no-underline transition-colors relative border rounded-full px-3 py-1.5 ${
        isOnPlaylist
          ? "text-stone-900 bg-stone-200 border-stone-400"
          : "text-stone-700 hover:text-stone-900 hover:bg-stone-100 border-stone-300"
      }`}
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
    </button>
  );
}
