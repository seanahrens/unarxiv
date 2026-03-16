"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePlaylist } from "@/contexts/PlaylistContext";
import { useAudio } from "@/contexts/AudioContext";
import { getReadHistory } from "@/lib/readStatus";
import { fetchPapersBatch, audioUrl, type Paper } from "@/lib/api";

export default function PlaylistPage() {
  const { playlist, removeFromPlaylist, reorderPlaylist } = usePlaylist();
  const { state, actions } = useAudio();
  const [papers, setPapers] = useState<Record<string, Paper>>({});
  const [historyPapers, setHistoryPapers] = useState<Record<string, Paper>>({});
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const [readHistory, setReadHistory] = useState<{ paperId: string; readAt: string }[]>([]);

  // Fetch playlist papers
  useEffect(() => {
    const ids = playlist.map((e) => e.paperId);
    if (ids.length === 0) {
      setPapers({});
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPapersBatch(ids)
      .then((fetched) => {
        const map: Record<string, Paper> = {};
        fetched.forEach((p) => (map[p.id] = p));
        setPapers(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playlist]);

  // Fetch history papers
  useEffect(() => {
    const history = getReadHistory();
    setReadHistory(history);
    const ids = history.map((e) => e.paperId);
    if (ids.length === 0) {
      setHistoryPapers({});
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    fetchPapersBatch(ids)
      .then((fetched) => {
        const map: Record<string, Paper> = {};
        fetched.forEach((p) => (map[p.id] = p));
        setHistoryPapers(map);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const ids = playlist.map((e) => e.paperId);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(idx, 0, moved);
    reorderPlaylist(ids);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // Touch-based reordering for mobile
  const touchStartY = useRef<number>(0);
  const touchItemIdx = useRef<number | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleTouchStart = (e: React.TouchEvent, idx: number) => {
    // Only start drag from the handle area (first 40px)
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (touch.clientX - rect.left > 40) return;
    touchStartY.current = touch.clientY;
    touchItemIdx.current = idx;
    setDragIdx(idx);
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchItemIdx.current === null) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    // Find which row we're over
    for (let i = 0; i < rowRefs.current.length; i++) {
      const row = rowRefs.current[i];
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) {
        setDragOverIdx(i);
        return;
      }
    }
  }, []);

  const handleTouchEnd = () => {
    if (touchItemIdx.current !== null && dragOverIdx !== null && touchItemIdx.current !== dragOverIdx) {
      const ids = playlist.map((e) => e.paperId);
      const [moved] = ids.splice(touchItemIdx.current, 1);
      ids.splice(dragOverIdx, 0, moved);
      reorderPlaylist(ids);
    }
    touchItemIdx.current = null;
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handlePlay = (paper: Paper) => {
    if (state.paperId === paper.id) {
      actions.togglePlay();
    } else {
      actions.loadPaper(paper.id, paper.title, audioUrl(paper.id));
    }
  };

  const currentIdx = playlist.findIndex((e) => e.paperId === state.paperId);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx !== -1 && currentIdx < playlist.length - 1;

  const handlePrev = () => {
    if (!hasPrev) return;
    const prev = papers[playlist[currentIdx - 1].paperId];
    if (prev) actions.loadPaper(prev.id, prev.title, audioUrl(prev.id));
  };

  const handleNext = () => {
    if (!hasNext) return;
    const next = papers[playlist[currentIdx + 1].paperId];
    if (next) actions.loadPaper(next.id, next.title, audioUrl(next.id));
  };

  return (
    <div className="space-y-2 md:space-y-8 -mx-6 md:mx-0">
      <section className="bg-white border-y md:border border-stone-300 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-stone-200 flex items-center justify-between">
          <h1 className="text-base md:text-lg font-bold text-stone-900 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            My Playlist
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              disabled={!hasPrev}
              className="w-7 h-7 flex items-center justify-center bg-stone-600 hover:bg-stone-500 disabled:bg-stone-300 text-white rounded-full transition-colors"
              title="Previous"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="4" width="3" height="16" rx="0.5" />
                <polygon points="21,4 9,12 21,20" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              disabled={!hasNext}
              className="w-7 h-7 flex items-center justify-center bg-stone-600 hover:bg-stone-500 disabled:bg-stone-300 text-white rounded-full transition-colors"
              title="Next"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="3,4 15,12 3,20" />
                <rect x="18" y="4" width="3" height="16" rx="0.5" />
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-stone-500 text-sm py-12 text-center">Loading...</div>
        ) : playlist.length === 0 ? (
          <div className="text-stone-500 text-sm py-12 text-center">
            Your playlist is empty. Add papers from the{" "}
            <Link href="/" className="text-stone-600 hover:text-stone-800 underline">home page</Link>.
          </div>
        ) : (
          <div className="divide-y divide-stone-200">
            {playlist.map((entry, idx) => {
              const paper = papers[entry.paperId];
              const isActive = state.paperId === entry.paperId;
              const isPlaying = isActive && state.isPlaying;
              const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;
              const dragAbove = isDragOver && dragIdx !== null && dragIdx > idx;
              const dragBelow = isDragOver && dragIdx !== null && dragIdx < idx;
              return (
                <div
                  key={entry.paperId}
                  ref={(el) => { rowRefs.current[idx] = el; }}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, idx)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`flex items-center gap-2 md:gap-3 px-3 md:px-5 py-3 transition-colors ${
                    dragIdx === idx ? "opacity-30" : isActive ? "bg-blue-100" : "hover:bg-stone-50"
                  } ${dragAbove ? "border-t-2 !border-t-stone-400" : ""} ${dragBelow ? "border-b-2 !border-b-stone-400" : ""}`}
                >
                  <span className="text-stone-500 cursor-grab shrink-0 touch-none">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="4" y1="8" x2="20" y2="8" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                      <line x1="4" y1="16" x2="20" y2="16" />
                    </svg>
                  </span>

                  {paper?.status === "complete" && (
                    <button
                      onClick={() => handlePlay(paper)}
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
                  )}

                  <Link href={`/p?id=${entry.paperId}`} className="flex-1 min-w-0 no-underline">
                    <span className="text-sm text-stone-800 line-clamp-2 md:truncate block">
                      {paper?.title || (loading ? "" : entry.paperId)}
                    </span>
                    {loading && !paper ? (
                      <span className="block h-3 w-32 bg-stone-100 rounded animate-pulse mt-1" />
                    ) : paper?.authors && paper.authors.length > 0 ? (
                      <span className="text-[11px] text-stone-500 truncate block">
                        <span className="md:hidden">
                          {paper.authors[0]}
                          {paper.authors.length > 1 && ` +${paper.authors.length - 1}`}
                        </span>
                        <span className="hidden md:inline">
                          {paper.authors.slice(0, 3).join(", ")}
                          {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                        </span>
                      </span>
                    ) : null}
                  </Link>

                  <button
                    onClick={() => removeFromPlaylist(entry.paperId)}
                    className="text-stone-500 hover:text-stone-700 transition-colors shrink-0"
                    title="Remove from playlist"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white border-y md:border border-stone-300 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-stone-200">
          <h2 className="text-base md:text-lg font-bold text-stone-900 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Listen History
          </h2>
        </div>

        {historyLoading ? (
          <div className="text-stone-500 text-sm py-12 text-center">Loading...</div>
        ) : readHistory.length === 0 ? (
          <div className="text-stone-500 text-sm py-12 text-center">No listen history yet.</div>
        ) : (
          <div className="divide-y divide-stone-200">
            {readHistory.map((entry) => {
              const paper = historyPapers[entry.paperId];
              const isActive = state.paperId === entry.paperId;
              const isPlaying = isActive && state.isPlaying;
              return (
                <div
                  key={entry.paperId}
                  className={`flex items-center gap-2 md:gap-3 px-3 md:px-5 py-3 transition-colors ${isActive ? "bg-blue-100" : "hover:bg-stone-50"}`}
                >
                  <span className="shrink-0 invisible">
                    <svg width="24" height="24" viewBox="0 0 24 24"><line x1="4" y1="8" x2="20" y2="8" /></svg>
                  </span>

                  {paper?.status === "complete" ? (
                    <button
                      onClick={() => handlePlay(paper)}
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
                  ) : (
                    <div className="w-7 shrink-0" />
                  )}
                  <Link href={`/p?id=${entry.paperId}`} className="flex-1 min-w-0 no-underline">
                    <span className="text-sm text-stone-800 line-clamp-2 md:truncate block">
                      {paper?.title || (historyLoading ? "" : entry.paperId)}
                      {historyLoading && !paper && (
                        <span className="inline-block h-3 w-48 bg-stone-100 rounded animate-pulse" />
                      )}
                    </span>
                    {paper?.authors && paper.authors.length > 0 && (
                      <span className="text-[11px] text-stone-500 truncate block">
                        <span className="md:hidden">
                          {paper.authors[0]}
                          {paper.authors.length > 1 && ` +${paper.authors.length - 1}`}
                        </span>
                        <span className="hidden md:inline">
                          {paper.authors.slice(0, 3).join(", ")}
                          {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                        </span>
                      </span>
                    )}
                  </Link>

                  <span className="shrink-0 invisible">
                    <svg width="18" height="18" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /></svg>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
