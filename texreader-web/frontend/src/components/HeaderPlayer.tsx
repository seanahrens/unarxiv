"use client";

import Link from "next/link";
import { useAudio } from "@/contexts/AudioContext";

export default function HeaderPlayer({ inline }: { inline?: boolean }) {
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

  if (!isActive) return null;

  // Inline variant: rendered inside the header on desktop
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        {/* Skip Back */}
        <button
          onClick={actions.skipBack}
          className="text-stone-400 hover:text-stone-700 transition-colors shrink-0"
          title="Back 15s"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">15</text>
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={actions.togglePlay}
          className="w-7 h-7 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-full transition-colors shrink-0"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="7,3 21,12 7,21" />
            </svg>
          )}
        </button>

        {/* Skip Forward */}
        <button
          onClick={actions.skipForward}
          className="text-stone-400 hover:text-stone-700 transition-colors shrink-0"
          title="Forward 30s"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">30</text>
          </svg>
        </button>

        {/* Title + progress */}
        <div className="min-w-0 max-w-[200px]">
          <Link
            href={`/abs?id=${paperId}`}
            className="block text-[10px] text-stone-600 hover:text-stone-900 truncate no-underline transition-colors"
            title={paperTitle || ""}
          >
            {paperTitle || "Unknown paper"}
          </Link>
          <div className="w-full h-0.5 bg-stone-200 rounded-full mt-0.5">
            <div
              className="h-full bg-blue-600 rounded-full transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  // Mobile variant: full-width bar below header
  return (
    <div className="border-b border-stone-200/60 bg-white/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-2 flex items-center gap-3">
        {/* Skip Back */}
        <button
          onClick={actions.skipBack}
          className="text-stone-400 hover:text-stone-700 transition-colors shrink-0"
          title="Back 15s"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">15</text>
          </svg>
        </button>

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

        {/* Skip Forward */}
        <button
          onClick={actions.skipForward}
          className="text-stone-400 hover:text-stone-700 transition-colors shrink-0"
          title="Forward 30s"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">30</text>
          </svg>
        </button>

        {/* Title + progress */}
        <div className="flex-1 min-w-0">
          <Link
            href={`/abs?id=${paperId}`}
            className="block text-xs text-stone-700 hover:text-stone-900 truncate no-underline transition-colors"
            title={paperTitle || ""}
          >
            {paperTitle || "Unknown paper"}
          </Link>
          <div className="w-full h-0.5 bg-stone-200 rounded-full mt-0.5">
            <div
              className="h-full bg-blue-600 rounded-full transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
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
