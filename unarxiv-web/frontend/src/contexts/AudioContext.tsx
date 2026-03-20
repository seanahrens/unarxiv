"use client";

import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { markAsRead } from "@/lib/readStatus";
import { removeFromPlaylist, getPlaylist } from "@/lib/playlist";
import { fetchPaper, audioUrl, savePlaybackPositionApi, getPlaybackPositionsApi } from "@/lib/api";

function getStorageKey(paperId: string) {
  return `pos-${paperId}`;
}

/** Read local position (handles both legacy number-only and new {position, updatedAt} format). */
function readLocalPosition(paperId: string): { position: number; updatedAt: string } | null {
  try {
    const raw = localStorage.getItem(getStorageKey(paperId));
    if (!raw) return null;
    // Try new format first
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.position === "number") {
        return { position: parsed.position, updatedAt: parsed.updatedAt || "" };
      }
    } catch {}
    // Legacy: plain number
    const t = parseFloat(raw);
    if (t > 0) return { position: t, updatedAt: "" };
  } catch {}
  return null;
}

/** Write local position with timestamp. */
function writeLocalPosition(paperId: string, position: number) {
  try {
    localStorage.setItem(getStorageKey(paperId), JSON.stringify({
      position,
      updatedAt: new Date().toISOString(),
    }));
  } catch {}
}

const RATE_KEY = "playback-rate";
const CURRENT_PAPER_KEY = "current-paper";
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
  const restoredRef = useRef(false);

  const [paperId, setPaperId] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Refs to avoid stale closures in event listeners
  const paperIdRef = useRef(paperId);
  paperIdRef.current = paperId;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  const loadPaperRef = useRef<((id: string, title: string, src: string) => void) | null>(null);

  // Save position for current paper (localStorage only)
  const savePosition = useCallback(() => {
    const id = paperIdRef.current;
    const time = currentTimeRef.current;
    if (id && time > 0) {
      writeLocalPosition(id, time);
    }
  }, []);

  // Save position to both localStorage and backend
  const savePositionToBackend = useCallback(() => {
    const id = paperIdRef.current;
    const time = currentTimeRef.current;
    if (id && time > 0) {
      writeLocalPosition(id, time);
      savePlaybackPositionApi(id, time).catch(() => {}); // fire-and-forget, graceful offline
    }
  }, []);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Throttle localStorage writes (~every 3s)
      if (paperIdRef.current && audio.currentTime > 0 && Math.floor(audio.currentTime) % 3 === 0) {
        writeLocalPosition(paperIdRef.current, audio.currentTime);
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => {
      setIsPlaying(true);
      savePositionToBackend();
    };
    const onPause = () => {
      setIsPlaying(false);
      savePositionToBackend();
    };
    const playNextInPlaylist = (afterId: string | null, skipCount: number = 0) => {
      if (skipCount > 20) { setIsPlaying(false); return; } // safety limit

      const playlist = getPlaylist();
      let nextPaperId: string | null = null;

      if (afterId) {
        const idx = playlist.findIndex((e) => e.paperId === afterId);
        if (idx !== -1 && idx < playlist.length - 1) {
          nextPaperId = playlist[idx + 1].paperId;
        } else if (idx === -1 && playlist.length > 0) {
          nextPaperId = playlist[0].paperId;
        }
      }

      if (nextPaperId) {
        const nextId = nextPaperId;
        fetchPaper(nextId)
          .then((paper) => {
            if (paper.status === "narrated" && loadPaperRef.current) {
              loadPaperRef.current(nextId, paper.title, audioUrl(nextId));
            } else {
              // Skip non-narrated papers
              playNextInPlaylist(nextId, skipCount + 1);
            }
          })
          .catch(() => {
            // Skip papers that fail to fetch
            playNextInPlaylist(nextId, skipCount + 1);
          });
      } else {
        setIsPlaying(false);
      }
    };

    const onEnded = () => {
      const finishedId = paperIdRef.current;

      if (finishedId) {
        markAsRead(finishedId);
        removeFromPlaylist(finishedId);
      }

      playNextInPlaylist(finishedId);
    };

    const onError = () => {
      // If audio fails to load (e.g. paper not narrated), skip to next
      const currentId = paperIdRef.current;
      if (currentId) {
        playNextInPlaylist(currentId);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  // Fetch backend positions on mount and merge with localStorage
  const backendPositionsRef = useRef<Record<string, { position: number; updated_at: string }>>({});
  useEffect(() => {
    getPlaybackPositionsApi().then((positions) => {
      backendPositionsRef.current = positions;
      // Merge: for each backend position, update localStorage if backend is more recent
      for (const [pid, backend] of Object.entries(positions)) {
        const local = readLocalPosition(pid);
        if (!local || (backend.updated_at && (!local.updatedAt || backend.updated_at > local.updatedAt))) {
          writeLocalPosition(pid, backend.position);
        }
      }
    }).catch(() => {});
  }, []);

  // Restore persisted paper + playback rate on mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // Restore playback rate
    try {
      const savedRate = localStorage.getItem(RATE_KEY);
      if (savedRate) {
        const rate = parseFloat(savedRate) || 1;
        setPlaybackRate(rate);
        if (audioRef.current) audioRef.current.playbackRate = rate;
      }
    } catch {}

    // Restore last-playing paper
    try {
      const raw = localStorage.getItem(CURRENT_PAPER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { paperId: string; paperTitle: string; src: string };
      if (!saved?.paperId || !saved?.src) return;

      setPaperId(saved.paperId);
      setPaperTitle(saved.paperTitle);
      setSrc(saved.src);

      const audio = audioRef.current;
      if (!audio) return;
      audio.src = saved.src;

      const onReady = () => {
        // Apply playback rate after load (load() resets it)
        const rate = parseFloat(localStorage.getItem(RATE_KEY) || "1") || 1;
        audio.playbackRate = rate;
        const local = readLocalPosition(saved.paperId);
        if (local && local.position > 0 && (!isFinite(audio.duration) || local.position < audio.duration)) {
          audio.currentTime = local.position;
          setCurrentTime(local.position);
        }
        setDuration(audio.duration || 0);
        audio.removeEventListener("loadedmetadata", onReady);
      };
      audio.addEventListener("loadedmetadata", onReady);
      audio.load();
    } catch {}
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

    // Save position for current paper before switching (including backend)
    savePositionToBackend();

    // Update state
    setPaperId(newPaperId);
    setPaperTitle(title);
    setSrc(newSrc);
    setCurrentTime(0);
    setDuration(0);

    // Persist for refresh survival
    try { localStorage.setItem(CURRENT_PAPER_KEY, JSON.stringify({ paperId: newPaperId, paperTitle: title, src: newSrc })); } catch {}

    // Load new source
    audio.src = newSrc;

    // Restore position and auto-play after metadata loads
    const onReady = () => {
      // Apply playback rate after load (load() resets it)
      audio.playbackRate = playbackRateRef.current;
      const local = readLocalPosition(newPaperId);
      if (local && local.position > 0 && (!isFinite(audio.duration) || local.position < audio.duration)) {
        audio.currentTime = local.position;
      }
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
  }, [savePositionToBackend]);
  loadPaperRef.current = loadPaper;

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

  const skipBack = useCallback((seconds = 10) => {
    if (typeof seconds !== "number") seconds = 10;
    const audio = audioRef.current;
    if (!audio || !isFinite(audio.currentTime)) return;
    audio.currentTime = Math.max(0, audio.currentTime - seconds);
  }, []);

  const skipForward = useCallback((seconds = 10) => {
    if (typeof seconds !== "number") seconds = 10;
    const audio = audioRef.current;
    if (!audio || !isFinite(audio.currentTime) || !isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.min(audio.duration, audio.currentTime + seconds);
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
    savePositionToBackend();
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
    try { localStorage.removeItem(CURRENT_PAPER_KEY); } catch {}
  }, [savePositionToBackend]);

  const state: AudioState = { paperId, paperTitle, src, isPlaying, currentTime, duration, playbackRate };
  const actions: AudioActions = { loadPaper, togglePlay, pause, seek, skipBack, skipForward, cycleSpeed, stop };

  return (
    <AudioContext.Provider value={{ state, actions }}>
      <audio ref={audioRef} preload="metadata" style={{ display: "none" }} />
      {children}
    </AudioContext.Provider>
  );
}
