"use client";

import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react";

function getStorageKey(paperId: string) {
  return `papear-pos-${paperId}`;
}

const RATE_KEY = "papear-playback-rate";
const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

interface AudioState {
  paperId: string | null;
  paperTitle: string | null;
  src: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
}

interface AudioActions {
  loadPaper: (paperId: string, title: string, src: string) => void;
  togglePlay: () => void;
  pause: () => void;
  seek: (time: number) => void;
  skipBack: (seconds?: number) => void;
  skipForward: (seconds?: number) => void;
  cycleSpeed: () => void;
  stop: () => void;
}

interface AudioContextValue {
  state: AudioState;
  actions: AudioActions;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const saved = localStorage.getItem(RATE_KEY);
      if (saved) return parseFloat(saved) || 1;
    } catch {}
    return 1;
  });

  // Refs to avoid stale closures in event listeners
  const paperIdRef = useRef(paperId);
  paperIdRef.current = paperId;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Save position for current paper
  const savePosition = useCallback(() => {
    const id = paperIdRef.current;
    const time = currentTimeRef.current;
    if (id && time > 0) {
      try { localStorage.setItem(getStorageKey(id), String(time)); } catch {}
    }
  }, []);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Throttle localStorage writes
      if (paperIdRef.current && audio.currentTime > 0 && Math.floor(audio.currentTime) % 3 === 0) {
        try { localStorage.setItem(getStorageKey(paperIdRef.current), String(audio.currentTime)); } catch {}
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // Save position on tab close
  useEffect(() => {
    window.addEventListener("beforeunload", savePosition);
    return () => window.removeEventListener("beforeunload", savePosition);
  }, [savePosition]);

  const loadPaper = useCallback((newPaperId: string, title: string, newSrc: string) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Already playing this paper — just resume if paused
    if (paperIdRef.current === newPaperId) {
      if (audio.paused) audio.play();
      return;
    }

    // Save position for current paper before switching
    savePosition();

    // Update state
    setPaperId(newPaperId);
    setPaperTitle(title);
    setSrc(newSrc);
    setCurrentTime(0);
    setDuration(0);

    // Load new source
    audio.src = newSrc;
    audio.playbackRate = playbackRate;

    // Restore position and auto-play after metadata loads
    const onReady = () => {
      try {
        const saved = localStorage.getItem(getStorageKey(newPaperId));
        if (saved) {
          const t = parseFloat(saved);
          if (t > 0 && (!isFinite(audio.duration) || t < audio.duration)) {
            audio.currentTime = t;
          }
        }
      } catch {}
      audio.play();
      audio.removeEventListener("loadedmetadata", onReady);
      audio.removeEventListener("canplay", onReady);
    };

    let fired = false;
    const onReadyOnce = () => {
      if (fired) return;
      fired = true;
      onReady();
    };

    audio.addEventListener("loadedmetadata", onReadyOnce);
    audio.addEventListener("canplay", onReadyOnce);
    audio.load();
  }, [playbackRate, savePosition]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) audio.play();
    else audio.pause();
  }, [src]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = time;
  }, []);

  const skipBack = useCallback((seconds = 15) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - seconds);
  }, []);

  const skipForward = useCallback((seconds = 30) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + seconds);
  }, []);

  const cycleSpeed = useCallback(() => {
    const audio = audioRef.current;
    const idx = SPEEDS.indexOf(playbackRate);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setPlaybackRate(next);
    if (audio) audio.playbackRate = next;
    try { localStorage.setItem(RATE_KEY, String(next)); } catch {}
  }, [playbackRate]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    savePosition();
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPaperId(null);
    setPaperTitle(null);
    setSrc(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [savePosition]);

  const state: AudioState = { paperId, paperTitle, src, isPlaying, currentTime, duration, playbackRate };
  const actions: AudioActions = { loadPaper, togglePlay, pause, seek, skipBack, skipForward, cycleSpeed, stop };

  return (
    <AudioContext.Provider value={{ state, actions }}>
      <audio ref={audioRef} preload="metadata" style={{ display: "none" }} />
      {children}
    </AudioContext.Provider>
  );
}
