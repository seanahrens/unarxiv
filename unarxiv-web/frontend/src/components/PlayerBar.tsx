"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAudio } from "@/contexts/AudioContext";
import { usePlaylist } from "@/contexts/PlaylistContext";
import AudioFileIcon from "@/components/AudioFileIcon";
import PaperListRow from "@/components/PaperListRow";
import DraggablePaperList from "@/components/DraggablePaperList";
import { fetchPaper, fetchPapersBatch, audioUrl, type Paper } from "@/lib/api";
import { getPlaylist } from "@/lib/playlist";

const COLLAPSE_KEY = "player-collapsed";
const AUTO_COLLAPSE_MS = 30_000;
const SHORTCUTS_SEEN_KEY = "player-shortcuts-seen";

function EqBars({ visible }: { visible: boolean }) {
  return (
    <span className="inline-flex items-end gap-[2px] h-3 w-[10px] shrink-0" aria-hidden>
      {visible ? (
        <>
          <span className="w-[2px] bg-indigo-400 rounded-full animate-eq-1" />
          <span className="w-[2px] bg-indigo-400 rounded-full animate-eq-2" />
          <span className="w-[2px] bg-indigo-400 rounded-full animate-eq-3" />
        </>
      ) : (
        <>
          <span className="w-[2px] h-[3px] bg-transparent rounded-full" />
          <span className="w-[2px] h-[3px] bg-transparent rounded-full" />
          <span className="w-[2px] h-[3px] bg-transparent rounded-full" />
        </>
      )}
    </span>
  );
}

/** Full-height scrubber with title overlay and drag handle */
function ScrubberTitle({
  progress,
  paperTitle,
  isPlaying,
  onSeek,
}: {
  progress: number;
  paperTitle: string | null;
  isPlaying: boolean;
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onClick={onSeek}
      className="relative flex-1 min-w-0 h-7 self-center cursor-pointer group rounded-md border border-slate-700 overflow-hidden select-none"
    >
      {/* Track background */}
      <div className="absolute inset-0 bg-slate-800 rounded-md" />
      {/* Elapsed fill */}
      <div
        className="absolute inset-y-0 left-0 bg-indigo-600/50 group-hover:bg-indigo-500/60 transition-colors"
        style={{ width: `${progress}%` }}
      />
      {/* Title + EQ overlay */}
      <div className="relative z-10 flex items-center gap-1.5 h-full px-2.5">
        <EqBars visible={isPlaying} />
        <span className="text-xs text-slate-300 truncate" title={paperTitle || ""}>
          {paperTitle || "Unknown paper"}
        </span>
      </div>
    </div>
  );
}

/** Prev/Next skip buttons (low contrast, smaller) */
function SkipPrevNext({
  onPrev,
  onNext,
}: {
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <button onClick={onPrev} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Previous in playlist (Shift+Left)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="5" width="2.5" height="14" rx="0.5" />
          <polygon points="19,5 9,12 19,19" />
        </svg>
      </button>
      <button onClick={onNext} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Next in playlist (Shift+Right)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,5 15,12 5,19" />
          <rect x="17.5" y="5" width="2.5" height="14" rx="0.5" />
        </svg>
      </button>
    </>
  );
}

export default function PlayerBar() {
  const { state, actions } = useAudio();
  const { playlist, removeFromPlaylist, reorderPlaylist } = usePlaylist();
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showCollapsedRow, setShowCollapsedRow] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const [playlistPapers, setPlaylistPapers] = useState<Record<string, Paper>>({});
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const prevPaperIdRef = useRef<string | null>(null);

  const { paperId, paperTitle, isPlaying, currentTime, duration, playbackRate } = state;
  const isActive = paperId !== null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Mount guard
  useEffect(() => {
    setMounted(true);
    try {
      const isCollapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
      setCollapsed(isCollapsed);
      setShowCollapsedRow(isCollapsed);
    } catch {}
  }, []);

  // Flash + fly-to when a new paper loads
  useEffect(() => {
    if (paperId && paperId !== prevPaperIdRef.current && prevPaperIdRef.current !== null) {
      setFlashing(true);
      const timer = setTimeout(() => setFlashing(false), 800);
      return () => clearTimeout(timer);
    }
  }, [paperId]);

  // Track previous paperId
  useEffect(() => {
    prevPaperIdRef.current = paperId;
  }, [paperId]);

  // Listen for fly-to events from play buttons
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number };
      const bar = barRef.current;
      const fly = flyRef.current;
      if (!bar || !fly || !detail) return;

      const barRect = bar.getBoundingClientRect();
      const targetX = barRect.left + barRect.width / 2;
      const targetY = barRect.top + barRect.height / 2;
      const dx = detail.x - targetX;
      const dy = detail.y - targetY;

      fly.style.left = `${targetX}px`;
      fly.style.top = `${targetY}px`;
      fly.style.setProperty("--fly-dx", `${dx}px`);
      fly.style.setProperty("--fly-dy", `${dy}px`);
      fly.classList.remove("animate-fly-to-player");
      // Force reflow
      void fly.offsetWidth;
      fly.classList.add("animate-fly-to-player");
    };
    window.addEventListener("playerbar-play", handler);
    return () => window.removeEventListener("playerbar-play", handler);
  }, []);

  // Fetch playlist papers when popup opens or playlist changes
  // Don't show popup until data is ready to avoid layout shift
  useEffect(() => {
    if (!showPlaylist) {
      setPlaylistLoading(false);
      return;
    }
    const ids = playlist.map((e) => e.paperId);
    if (ids.length === 0) {
      setPlaylistPapers({});
      setPlaylistLoading(false);
      return;
    }
    setPlaylistLoading(true);
    fetchPapersBatch(ids)
      .then((fetched) => {
        const map: Record<string, Paper> = {};
        fetched.forEach((p) => (map[p.id] = p));
        setPlaylistPapers(map);
      })
      .catch(() => {})
      .finally(() => setPlaylistLoading(false));
  }, [showPlaylist, playlist]);

  // Toggle playlist popup — use e.currentTarget so we always get the clicked button's rect
  const togglePlaylist = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const bar = barRef.current;
    if (bar) {
      const btnRect = e.currentTarget.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        setPopupStyle({ left: 0, right: 0, bottom: window.innerHeight - barRect.top });
      } else {
        setPopupStyle({
          right: window.innerWidth - btnRect.right,
          bottom: window.innerHeight - barRect.top,
          maxWidth: 512,
        });
      }
    }
    setShowPlaylist((prev) => !prev);
  }, []);

  // Persist collapse preference
  // When expanding: hide collapsed row immediately, animate expanded in
  // When collapsing: show collapsed row immediately, animate expanded out underneath
  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {}
      setShowCollapsedRow(next);
      return next;
    });
  }, []);

  // Auto-expand when playback starts
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      setCollapsed(false);
      setShowCollapsedRow(false);
      try { localStorage.setItem(COLLAPSE_KEY, "0"); } catch {}
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Auto-collapse after 30s pause
  useEffect(() => {
    if (autoCollapseTimer.current) {
      clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
    if (!isPlaying && isActive) {
      autoCollapseTimer.current = setTimeout(() => {
        setCollapsed(true);
        setShowCollapsedRow(true);
        try { localStorage.setItem(COLLAPSE_KEY, "1"); } catch {}
      }, AUTO_COLLAPSE_MS);
    }
    return () => {
      if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current);
    };
  }, [isPlaying, isActive]);

  // Seek handler — uses currentTarget so each scrubber instance measures itself
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    actions.seek(ratio * duration);
  }, [duration, actions]);

  // Playlist prev/next
  const skipToPlaylistItem = useCallback((direction: "prev" | "next") => {
    if (!paperId) return;
    const pl = getPlaylist();
    const idx = pl.findIndex((e) => e.paperId === paperId);
    const targetIdx = direction === "next" ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= pl.length) return;
    const target = pl[targetIdx];
    fetchPaper(target.paperId)
      .then((paper) => actions.loadPaper(target.paperId, paper.title, audioUrl(target.paperId)))
      .catch(() => {});
  }, [paperId, actions]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          actions.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) skipToPlaylistItem("prev");
          else actions.skipBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) skipToPlaylistItem("next");
          else actions.skipForward();
          break;
        case "ArrowUp":
          e.preventDefault();
          actions.cycleSpeed();
          break;
        case "ArrowDown": {
          e.preventDefault();
          const SPEEDS = [1, 1.25, 1.5, 1.75, 2];
          for (let i = 0; i < SPEEDS.length - 1; i++) actions.cycleSpeed();
          break;
        }
        case "?":
          setShowShortcuts((prev) => !prev);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, actions, playbackRate, skipToPlaylistItem]);

  // Show shortcut hint on first use
  const [showShortcutHint, setShowShortcutHint] = useState(false);
  useEffect(() => {
    if (!isActive || !mounted) return;
    try {
      if (!localStorage.getItem(SHORTCUTS_SEEN_KEY)) {
        setShowShortcutHint(true);
        const timer = setTimeout(() => {
          setShowShortcutHint(false);
          localStorage.setItem(SHORTCUTS_SEEN_KEY, "1");
        }, 6000);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, [isActive, mounted]);

  // no-op placeholder to preserve hook order
  const [barHeight] = useState(0);
  useEffect(() => {}, []);

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  if (!mounted || !isActive) return null;

  // Playlist popup overlay — wait for data before rendering to avoid layout shift
  const playlistPopup = showPlaylist && !playlistLoading && (
    <div className="fixed z-[101] animate-panel-fade-in" style={popupStyle}>
      <div className="bg-slate-900 border border-slate-700 md:rounded-xl shadow-xl overflow-hidden max-h-[60vh] min-h-[200px] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="10" width="11" height="2" />
              <rect x="3" y="6" width="11" height="2" />
              <rect x="3" y="14" width="7" height="2" />
              <polygon points="16,13 16,21 22,17" />
            </svg>
            My Playlist
          </h3>
          <button onClick={() => setShowPlaylist(false)} className="text-slate-500 hover:text-slate-200 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain flex-1">
          {playlist.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">
              Your playlist is empty.
              <div className="mt-2">
                <Link href="/" className="text-indigo-400 hover:text-indigo-300 underline text-sm" onClick={() => setShowPlaylist(false)}>
                  Add papers from the home page
                </Link>
              </div>
            </div>
          ) : (
            <DraggablePaperList
              items={playlist.map((e) => e.paperId)}
              papers={playlistPapers}
              loading={false}
              onReorder={reorderPlaylist}
              onRemove={removeFromPlaylist}
              emptyMessage="Your playlist is empty."
              emptyAction={
                <Link href="/" className="text-indigo-400 hover:text-indigo-300 underline text-sm" onClick={() => setShowPlaylist(false)}>
                  Add papers from the home page
                </Link>
              }
            />
          )}
        </div>
      </div>
    </div>
  );

  // Playlist icon button (reused in all views)
  const playlistButton = (size = 20) => (
    <button
      id="player-playlist-button"
      onClick={togglePlaylist}
      className={`transition-colors shrink-0 flex items-center ${showPlaylist ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"}`}
      title="Toggle playlist"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <rect x="3" y="10" width="11" height="2" />
        <rect x="3" y="6" width="11" height="2" />
        <rect x="3" y="14" width="7" height="2" />
        <polygon points="16,13 16,21 22,17" />
      </svg>
    </button>
  );

  // Shortcut help overlay
  const shortcutOverlay = showShortcuts && (
    <div
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[calc(100%-2rem)] max-w-md bg-slate-800 text-slate-100 rounded-lg shadow-xl p-4 text-sm z-60"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium">Keyboard Shortcuts</span>
        <button onClick={() => setShowShortcuts(false)} className="text-slate-400 hover:text-slate-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-slate-400">
        <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">Space</kbd></span><span>Play / Pause</span>
        <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">&larr;</kbd></span><span>Skip back 10s</span>
        <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">&rarr;</kbd></span><span>Skip forward 10s</span>
        <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">&uarr;</kbd></span><span>Speed up</span>
        <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">&darr;</kbd></span><span>Speed down</span>
        <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">Shift+&larr;</kbd></span><span>Previous in playlist</span>
        <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">Shift+&rarr;</kbd></span><span>Next in playlist</span>
        <span><kbd className="bg-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">?</kbd></span><span>Toggle this help</span>
      </div>
    </div>
  );

  // Flying dot element (fixed position, rendered via portal-like approach)
  const flyDot = (
    <div
      ref={flyRef}
      className="fixed z-[200] w-4 h-4 -ml-2 -mt-2 rounded-full bg-indigo-500 pointer-events-none opacity-0"
      style={{ left: 0, top: 0 }}
    />
  );

  // Collapsed view
  // Unified view — collapsed row is always visible, expanded controls animate in/out
  return (
    <>
      {flyDot}
      <div ref={barRef} className={`fixed bottom-0 left-0 right-0 z-[100] pb-[env(safe-area-inset-bottom)] ${flashing ? "animate-player-flash" : ""}`}>
        {/* Shortcut hint toast */}
        {!collapsed && showShortcutHint && (
          <div className="hidden md:block fixed left-1/2 -translate-x-1/2 bottom-16 bg-slate-800 text-slate-100 text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap animate-fade-in z-[101]">
            Press <kbd className="bg-slate-700 px-1 py-0.5 rounded font-mono">?</kbd> for keyboard shortcuts
          </div>
        )}
        <div className="bg-slate-900 border-t border-slate-700 shadow-[0_-2px_20px_rgba(0,0,0,0.4)] relative">
          {playlistPopup}
          {shortcutOverlay}

          {/* Collapsed row — shown after expand-out animation finishes */}
          <div className={showCollapsedRow ? "" : "hidden"}>
            <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3">
              <Link href={`/p?id=${paperId}`} className="text-indigo-400 hover:text-indigo-300 transition-colors shrink-0">
                <AudioFileIcon size={22} />
              </Link>
              <ScrubberTitle
                progress={progress}
                paperTitle={paperTitle}
                isPlaying={isPlaying}
                onSeek={handleSeek}
              />
              <button
                onClick={actions.togglePlay}
                className="w-7 h-7 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors shrink-0"
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
              {playlistButton()}
              <button
                onClick={toggleCollapse}
                className="text-slate-500 hover:text-slate-200 transition-colors shrink-0"
                title="Expand player"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Expanded controls — animate height via grid-rows (only on expand) */}
          <div
            className={`grid ${collapsed ? "" : "transition-[grid-template-rows] duration-300 ease-in-out"}`}
            style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
          >
            <div className="overflow-hidden">

              {/* Desktop layout: single row */}
              <div className="hidden md:flex max-w-5xl mx-auto px-4 items-center gap-3 h-12">
                <Link href={`/p?id=${paperId}`} className="text-indigo-400 hover:text-indigo-300 transition-colors shrink-0 flex items-center">
                  <AudioFileIcon size={32} />
                </Link>
                <ScrubberTitle
                  progress={progress}
                  paperTitle={paperTitle}
                  isPlaying={isPlaying}
                  onSeek={handleSeek}
                />
                <span className="text-3xs font-mono text-slate-500 tabular-nums shrink-0 flex items-center">
                  {fmtTime(currentTime)} / {duration ? fmtTime(duration) : "--"}
                </span>
                <button onClick={() => skipToPlaylistItem("prev")} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Previous in playlist (Shift+Left)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="5" width="2.5" height="14" rx="0.5" />
                    <polygon points="19,5 9,12 19,19" />
                  </svg>
                </button>
                <button onClick={() => actions.skipBack()} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Back 10s">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
                </button>
                <button
                  onClick={actions.togglePlay}
                  className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors shrink-0 self-center"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,3 21,12 7,21" /></svg>
                  )}
                </button>
                <button onClick={() => actions.skipForward()} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Forward 10s">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" /></svg>
                </button>
                <button onClick={() => skipToPlaylistItem("next")} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Next in playlist (Shift+Right)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,5 15,12 5,19" />
                    <rect x="17.5" y="5" width="2.5" height="14" rx="0.5" />
                  </svg>
                </button>
                <button onClick={actions.cycleSpeed} className="text-3xs font-mono text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded px-1.5 py-1 transition-colors shrink-0 min-w-[46px] text-center self-center" title="Speed">
                  {playbackRate}x
                </button>
                <button onClick={() => setShowShortcuts((p) => !p)} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Keyboard shortcuts (?)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <line x1="6" y1="10" x2="6" y2="10.01" /><line x1="10" y1="10" x2="10" y2="10.01" />
                    <line x1="14" y1="10" x2="14" y2="10.01" /><line x1="18" y1="10" x2="18" y2="10.01" />
                    <line x1="8" y1="14" x2="16" y2="14" />
                  </svg>
                </button>
                {playlistButton()}
                <button onClick={toggleCollapse} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Collapse player">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>

              {/* Mobile layout: scrubber row + controls row */}
              <div className="md:hidden">
                {/* Top row: icon + scrubber + collapse */}
                <div className="flex items-center h-10 px-3 pt-1.5 gap-2">
                  <Link href={`/p?id=${paperId}`} className="text-indigo-400 hover:text-indigo-300 transition-colors shrink-0 flex items-center">
                    <AudioFileIcon size={28} />
                  </Link>
                  <ScrubberTitle
                    progress={progress}
                    paperTitle={paperTitle}
                    isPlaying={isPlaying}
                    onSeek={handleSeek}
                  />
                  {/* Playlist button with doubled tap width */}
                  <div className="flex items-center justify-center w-10 shrink-0">
                    {playlistButton()}
                  </div>
                  <button onClick={toggleCollapse} className="text-slate-500 hover:text-slate-200 transition-colors shrink-0 flex items-center" title="Collapse player">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
                {/* Bottom row: speed left + transport center + time right */}
                <div className="relative flex items-center px-3 py-2">
                  {/* Left: speed button */}
                  <button onClick={actions.cycleSpeed} className="text-3xs font-mono text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded px-1.5 py-1 transition-colors shrink-0 min-w-[46px] text-center" title="Speed">
                    {playbackRate}x
                  </button>
                  {/* Center: transport controls with prev/next */}
                  <div className="flex items-center gap-4 mx-auto">
                    <button onClick={() => skipToPlaylistItem("prev")} className="text-slate-500 hover:text-slate-200 transition-colors" title="Previous in playlist">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4" y="5" width="2.5" height="14" rx="0.5" />
                        <polygon points="19,5 9,12 19,19" />
                      </svg>
                    </button>
                    <button onClick={() => actions.skipBack()} className="text-slate-500 hover:text-slate-200 transition-colors" title="Back 10s">
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
                    </button>
                    <button
                      onClick={actions.togglePlay}
                      className="w-11 h-11 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,3 21,12 7,21" /></svg>
                      )}
                    </button>
                    <button onClick={() => actions.skipForward()} className="text-slate-500 hover:text-slate-200 transition-colors" title="Forward 10s">
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" /></svg>
                    </button>
                    <button onClick={() => skipToPlaylistItem("next")} className="text-slate-500 hover:text-slate-200 transition-colors" title="Next in playlist">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5,5 15,12 5,19" />
                        <rect x="17.5" y="5" width="2.5" height="14" rx="0.5" />
                      </svg>
                    </button>
                  </div>
                  {/* Right: stacked elapsed / total */}
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-3xs font-mono text-slate-400 tabular-nums leading-tight">{fmtTime(currentTime)}</span>
                    <span className="text-3xs font-mono text-slate-500 tabular-nums leading-tight">{duration ? fmtTime(duration) : "--"}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
