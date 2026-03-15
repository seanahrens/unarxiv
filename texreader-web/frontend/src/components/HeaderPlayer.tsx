"use client";

import Link from "next/link";
import { useAudio } from "@/contexts/AudioContext";

export default function HeaderPlayer() {
  const { state, actions } = useAudio();
  const { paperId, paperTitle, isPlaying, currentTime, duration, playbackRate } = state;

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isActive = paperId !== null;

  return (
    <div
      className="overflow-hidden border-b border-stone-200/60 bg-white/80 backdrop-blur-sm transition-all duration-300 ease-in-out"
      style={{
        maxHeight: isActive ? "60px" : "0px",
        opacity: isActive ? 1 : 0,
      }}
    >
      <div className="max-w-5xl mx-auto px-6 py-2 flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={actions.togglePlay}
          className="w-7 h-7 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-full transition-colors shrink-0"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="7,3 21,12 7,21" />
            </svg>
          )}
        </button>

        {/* Progress bar (thin) */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            {/* Paper title as link */}
            <Link
              href={`/papers/?id=${paperId}`}
              className="block text-xs text-stone-700 hover:text-stone-900 truncate no-underline transition-colors"
              title={paperTitle || ""}
            >
              {paperTitle || "Unknown paper"}
            </Link>
            {/* Thin progress bar */}
            <div className="w-full h-0.5 bg-stone-200 rounded-full mt-0.5">
              <div
                className="h-full bg-blue-600 rounded-full transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Time */}
        <span className="text-[10px] font-mono text-stone-400 tabular-nums shrink-0">
          {fmtTime(currentTime)}/{duration ? fmtTime(duration) : "--:--"}
        </span>

        {/* Speed */}
        <button
          onClick={actions.cycleSpeed}
          className="text-[10px] font-mono text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded px-1.5 py-0.5 transition-colors shrink-0"
          title="Speed"
        >
          {playbackRate}x
        </button>

        {/* Close */}
        <button
          onClick={actions.stop}
          className="text-stone-300 hover:text-stone-500 transition-colors shrink-0"
          title="Close player"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
