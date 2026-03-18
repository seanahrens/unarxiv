"use client";

import { usePathname, useRouter } from "next/navigation";
import { usePlaylist } from "@/contexts/PlaylistContext";

export default function PlaylistNavButton() {
  const { playlistCount, badgePulse } = usePlaylist();
  const pathname = usePathname();
  const router = useRouter();
  const isOnPlaylist = pathname === "/my-papers" || pathname === "/my-papers/";

  const handleClick = () => {
    if (isOnPlaylist) {
      // Toggle off: go back to wherever the user came from
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    } else {
      router.push("/my-papers");
    }
  };

  return (
    <button
      id="playlist-nav-button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider font-[family-name:var(--font-mono-brand)] transition-colors relative border-2 px-3 py-1.5 ${
        isOnPlaylist
          ? "text-white bg-black border-black"
          : "text-black bg-white border-black hover:bg-[#d32f2f] hover:text-white hover:border-[#d32f2f]"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 576 512" fill="currentColor" aria-hidden="true">
        <path d="M384 480h48c11.4 0 21.9-6 27.6-15.9l112-192c5.8-9.9 5.8-22.1 .1-32.1S555.5 224 544 224H144c-11.4 0-21.9 6-27.6 15.9L4.4 431.9c-5.8 9.9-5.8 22.1-.1 32.1S20.5 480 32 480H384zm-16-48H49.5l96-164.3H497.5l-96 164.3H368zM48 320V128c0-8.8 7.2-16 16-16h120l40 40h176c8.8 0 16 7.2 16 16v32h48v-32c0-35.3-28.7-64-64-64H243.9L203.9 64H64C28.7 64 0 92.7 0 128v261.3l48-82.3z" />
      </svg>
      <span className="font-semibold">My Papers</span>
    </button>
  );
}
