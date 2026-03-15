"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const restoredRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (paperId && audio.currentTime > 0) {
        try { localStorage.setItem(getStorageKey(paperId), String(audio.currentTime)); } catch {}
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const restorePosition = () => {
      if (paperId && !restoredRef.current) {
        restoredRef.current = true;
        try {
          const saved = localStorage.getItem(getStorageKey(paperId));
          if (saved) {
            const t = parseFloat(saved);
            if (t > 0 && (!isFinite(audio.duration) || t < audio.duration)) {
              audio.currentTime = t;
              setCurrentTime(t);
            }
          }
        } catch {}
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", restorePosition);
    // Safari sometimes skips loadedmetadata, so also try on canplay
    audio.addEventListener("canplay", restorePosition);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", restorePosition);
      audio.removeEventListener("canplay", restorePosition);
    };
  }, [paperId]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play();
  }, [isPlaying]);

  const skipBack = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - 15);
  }, []);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.min(audio.duration, audio.currentTime + 30);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Number(e.target.value);
  }, []);

  const cycleSpeed = useCallback(() => {
    const speeds = [1, 1.25, 1.5, 1.75, 2];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [playbackRate]);

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
        <audio ref={audioRef} src={src} preload="metadata" />
        <button onClick={togglePlay} className="w-7 h-7 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-full transition-colors shrink-0" title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <input type="range" min={0} max={duration || 0} value={currentTime} onChange={handleSeek}
          className="w-24 h-1 bg-stone-200 rounded-full appearance-none cursor-pointer accent-blue-600"
          style={{ background: `linear-gradient(to right, #2563eb ${progress}%, #e7e5e4 ${progress}%)` }}
        />
        <span className="text-[10px] font-mono text-stone-400 tabular-nums w-8">{fmtTime(currentTime)}</span>
        <button onClick={cycleSpeed} className="text-[10px] font-mono text-stone-500 hover:text-stone-800 bg-stone-100 rounded px-1.5 py-0.5" title="Speed">
          {playbackRate}x
        </button>
      </div>
    );
  }

  // ── COMPACT: single row, all controls visible ──
  if (variant === "compact") {
    return (
      <div className="bg-white border border-stone-200 rounded-xl px-4 py-2.5 shadow-sm">
        <audio ref={audioRef} src={src} preload="metadata" />
        <div className="flex items-center gap-3">
          <button onClick={skipBack} className="text-stone-400 hover:text-stone-700 transition-colors shrink-0" title="Back 15s">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
              <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">15</text>
            </svg>
          </button>
          <button onClick={togglePlay} className="w-9 h-9 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-full transition-colors shrink-0" title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={skipForward} className="text-stone-400 hover:text-stone-700 transition-colors shrink-0" title="Fwd 30s">
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
          <button onClick={cycleSpeed} className="text-xs font-mono font-medium text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-md px-2 py-0.5 transition-colors shrink-0" title="Speed">
            {playbackRate}x
          </button>
        </div>
      </div>
    );
  }

  // ── STANDARD: two-row layout (current default) ──
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
      <audio ref={audioRef} src={src} preload="metadata" />
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
        <button onClick={skipBack} className="p-2 text-stone-400 hover:text-stone-700 transition-colors" title="Back 15 seconds">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">15</text>
          </svg>
        </button>
        <button onClick={togglePlay} className="w-11 h-11 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-full transition-colors" title={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,3 21,12 7,21" /></svg>
          )}
        </button>
        <button onClick={skipForward} className="p-2 text-stone-400 hover:text-stone-700 transition-colors" title="Forward 30 seconds">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
            <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold">30</text>
          </svg>
        </button>
        <button onClick={cycleSpeed} className="ml-1 px-2.5 py-1 text-xs font-mono font-medium text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors" title="Playback speed">
          {playbackRate}x
        </button>
      </div>
    </div>
  );
}
