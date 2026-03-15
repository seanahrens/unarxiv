"use client";

import { useState, useEffect } from "react";
import { useAudio } from "@/contexts/AudioContext";

interface AudioPlayerProps {
  src: string;
  title: string;
  paperId?: string;
  variant?: "standard" | "compact" | "inline";
}

function getStorageKey(paperId: string) {
  return `papear-pos-${paperId}`;
}

export default function AudioPlayer({ src, title, paperId, variant = "standard" }: AudioPlayerProps) {
  const { state, actions } = useAudio();

  // Is this player's paper the one currently loaded globally?
  const isGloballyActive = paperId != null && state.paperId === paperId;

  // For dormant state: read saved position from localStorage
  const [savedTime, setSavedTime] = useState(0);
  useEffect(() => {
    if (!isGloballyActive && paperId) {
      try {
        const saved = localStorage.getItem(getStorageKey(paperId));
        if (saved) setSavedTime(parseFloat(saved) || 0);
      } catch {}
    }
  }, [isGloballyActive, paperId]);

  // Derive values from context (active) or defaults (dormant)
  const isPlaying = isGloballyActive ? state.isPlaying : false;
  const currentTime = isGloballyActive ? state.currentTime : savedTime;
  const duration = isGloballyActive ? state.duration : 0;
  const playbackRate = isGloballyActive ? state.playbackRate : 1;

  const handleTogglePlay = () => {
    if (isGloballyActive) {
      actions.togglePlay();
    } else if (paperId) {
      actions.loadPaper(paperId, title, src);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isGloballyActive) actions.seek(Number(e.target.value));
  };

  const handleSkipBack = () => {
    if (isGloballyActive) actions.skipBack();
  };

  const handleSkipForward = () => {
    if (isGloballyActive) actions.skipForward();
  };

  const handleCycleSpeed = () => {
    if (isGloballyActive) actions.cycleSpeed();
  };

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const PlayIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="7,3 21,12 7,21" />
    </svg>
  );
  const PauseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );

  // ── INLINE: fits on the same line as buttons ──
  if (variant === "inline") {
    return (
      <div className="inline-flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-2 py-1.5">
        <button onClick={handleTogglePlay} className="w-7 h-7 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-full transition-colors shrink-0" title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <input type="range" min={0} max={duration || 0} value={currentTime} onChange={handleSeek}
          className="w-24 h-1 bg-stone-200 rounded-full appearance-none cursor-pointer accent-blue-600"
          style={{ background: `linear-gradient(to right, #2563eb ${progress}%, #e7e5e4 ${progress}%)` }}
        />
        <span className="text-[10px] font-mono text-stone-400 tabular-nums w-8">{fmtTime(currentTime)}</span>
        <button onClick={handleCycleSpeed} className="text-[10px] font-mono text-stone-500 hover:text-stone-800 bg-stone-100 rounded px-1.5 py-0.5" title="Speed">
          {playbackRate}x
        </button>
      </div>
    );
  }

  // ── COMPACT: single row, all controls visible ──
  if (variant === "compact") {
    return (
      <div className="bg-white border border-stone-200 rounded-xl px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={handleSkipBack} className="text-stone-400 hover:text-stone-700 transition-colors shrink-0" title="Back 15s">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
              <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">15</text>
            </svg>
          </button>
          <button onClick={handleTogglePlay} className="w-9 h-9 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-full transition-colors shrink-0" title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={handleSkipForward} className="text-stone-400 hover:text-stone-700 transition-colors shrink-0" title="Fwd 30s">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
              <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">30</text>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <input type="range" min={0} max={duration || 0} value={currentTime} onChange={handleSeek}
              className="w-full h-1 bg-stone-200 rounded-full appearance-none cursor-pointer accent-blue-600"
              style={{ background: `linear-gradient(to right, #2563eb ${progress}%, #e7e5e4 ${progress}%)` }}
            />
          </div>
          <span className="text-xs font-mono text-stone-400 tabular-nums shrink-0">
            {fmtTime(currentTime)}/{duration ? fmtTime(duration) : "--:--"}
          </span>
          <button onClick={handleCycleSpeed} className="text-xs font-mono font-medium text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-md px-2 py-0.5 transition-colors shrink-0" title="Speed">
            {playbackRate}x
          </button>
        </div>
      </div>
    );
  }

  // ── STANDARD: two-row layout (current default) ──
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
      <div className="mb-4">
        <input type="range" min={0} max={duration || 0} value={currentTime} onChange={handleSeek}
          className="w-full h-1 bg-stone-200 rounded-full appearance-none cursor-pointer accent-blue-600"
          style={{ background: `linear-gradient(to right, #2563eb ${progress}%, #e7e5e4 ${progress}%)` }}
        />
        <div className="flex justify-between text-xs text-stone-400 mt-1.5 font-mono">
          <span>{fmtTime(currentTime)}</span>
          <span>{duration ? fmtTime(duration) : "--:--"}</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button onClick={handleSkipBack} className="p-2 text-stone-400 hover:text-stone-700 transition-colors" title="Back 15 seconds">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">15</text>
          </svg>
        </button>
        <button onClick={handleTogglePlay} className="w-11 h-11 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-full transition-colors" title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,3 21,12 7,21" /></svg>
          )}
        </button>
        <button onClick={handleSkipForward} className="p-2 text-stone-400 hover:text-stone-700 transition-colors" title="Forward 30 seconds">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">30</text>
          </svg>
        </button>
        <button onClick={handleCycleSpeed} className="ml-1 px-2.5 py-1 text-xs font-mono font-medium text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors" title="Playback speed">
          {playbackRate}x
        </button>
      </div>
    </div>
  );
}
