"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { useAudio } from "@/contexts/AudioContext";
import AudioFileIcon from "@/components/AudioFileIcon";
import { formatDurationShort } from "@/lib/api";

export default function HeaderPlayer({ inline }: { inline?: boolean }) {
  const { state, actions } = useAudio();
  const { paperId, paperTitle, isPlaying, currentTime, duration, playbackRate } = state;
  const progressRef = useRef<HTMLDivElement>(null);

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const fmtShort = formatDurationShort;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isActive = paperId !== null;

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    actions.seek(ratio * duration);
  }, [duration, actions]);

  if (!isActive) return null;

  const controls = (
    <>
      {/* Paper link */}
      <Link
        href={`/p?id=${paperId}`}
        className="text-stone-600 hover:text-stone-800 transition-colors shrink-0"
        title="View paper"
      >
        <AudioFileIcon size={30} />
      </Link>

      {/* Title + seekable progress */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <span
          className="block text-xs text-stone-600 truncate"
          title={paperTitle || ""}
        >
          {paperTitle || "Unknown paper"}
        </span>
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="w-full h-1.5 bg-stone-200 rounded-full mt-0.5 cursor-pointer group"
        >
          <div
            className="h-full bg-stone-500 rounded-full transition-[width] duration-200 group-hover:bg-stone-600"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Duration shorthand */}
      <span className="text-[10px] font-mono text-stone-500 tabular-nums shrink-0 min-w-[28px] text-right">
        {duration ? fmtShort(duration) : "--"}
      </span>

      {/* Skip Back */}
      <button
        onClick={() => actions.skipBack()}
        className="text-stone-600 hover:text-stone-800 transition-colors shrink-0"
        title="Back 15s"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
        </svg>
      </button>

      {/* Play/Pause */}
      <button
        onClick={actions.togglePlay}
        className="w-7 h-7 flex items-center justify-center bg-stone-700 hover:bg-stone-600 text-white rounded-full transition-colors shrink-0"
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
        onClick={() => actions.skipForward()}
        className="text-stone-600 hover:text-stone-800 transition-colors shrink-0"
        title="Forward 15s"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
        </svg>
      </button>

      {/* Speed */}
      <button
        onClick={actions.cycleSpeed}
        className="text-[10px] font-mono text-stone-600 hover:text-stone-800 bg-stone-200 hover:bg-stone-300 rounded px-1.5 py-2.5 transition-colors shrink-0 min-w-[46px] text-center"
        title="Speed"
      >
        {playbackRate}x
      </button>
    </>
  );

  if (inline) {
    return (
      <div className="flex items-center gap-2 w-full min-w-0">
        {controls}
      </div>
    );
  }

  return (
    <div className="border-b border-stone-200 bg-white/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-2 flex items-center gap-2 min-w-0">
        {controls}
      </div>
    </div>
  );
}
