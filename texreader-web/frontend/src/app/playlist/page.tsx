"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePlaylist } from "@/contexts/PlaylistContext";
import { useAudio } from "@/contexts/AudioContext";
import { getReadHistory } from "@/lib/readStatus";
import { fetchPapersBatch, audioUrl, type Paper } from "@/lib/api";

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return dateStr;
  }
}

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

  return (
    <div>
      <h1 className="text-xl font-bold text-stone-900 mb-6">My Playlist</h1>

      {loading ? (
        <div className="text-stone-400 text-sm py-8">Loading...</div>
      ) : playlist.length === 0 ? (
        <div className="text-stone-400 text-sm py-8">
          Your playlist is empty. Add papers from the <Link href="/" className="text-stone-600 hover:text-stone-800 underline">home page</Link>.
        </div>
      ) : (
        <div className="divide-y divide-stone-100 mb-10">
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
                className={`flex items-center gap-3 px-3 py-3 transition-colors ${
                  dragIdx === idx ? "opacity-30" : "hover:bg-stone-50"
                } ${dragAbove ? "border-t-2 !border-t-stone-400" : ""} ${dragBelow ? "border-b-2 !border-b-stone-400" : ""}`}
              >
                {/* Drag handle */}
                <span className="text-stone-400 cursor-grab shrink-0 touch-none">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="8" x2="20" y2="8" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="16" x2="20" y2="16" />
                  </svg>
                </span>

                {/* Play/Pause */}
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

                {/* Title + authors */}
                <Link
                  href={`/p?id=${entry.paperId}`}
                  className="flex-1 min-w-0 no-underline"
                >
                  <span className="text-sm text-stone-800 truncate block">
                    {paper?.title || (loading ? "" : entry.paperId)}
                  </span>
                  {loading && !paper ? (
                    <span className="block h-3 w-32 bg-stone-100 rounded animate-pulse mt-1" />
                  ) : paper?.authors && paper.authors.length > 0 ? (
                    <span className="text-[11px] text-stone-400 truncate block">
                      {paper.authors.slice(0, 3).join(", ")}
                      {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                    </span>
                  ) : null}
                </Link>

                {/* Remove */}
                <button
                  onClick={() => removeFromPlaylist(entry.paperId)}
                  className="text-stone-400 hover:text-stone-600 transition-colors shrink-0"
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

      {/* Listen History */}
      <h2 className="text-lg font-bold text-stone-900 mb-4 mt-10 pt-6 border-t border-stone-200">
        Listen History
      </h2>

      {historyLoading ? (
        <div className="text-stone-400 text-sm py-8">Loading...</div>
      ) : readHistory.length === 0 ? (
        <div className="text-stone-400 text-sm py-8">No listen history yet.</div>
      ) : (
        <div className="space-y-1">
          {readHistory.map((entry) => {
            const paper = historyPapers[entry.paperId];
            return (
              <Link
                key={entry.paperId}
                href={`/p?id=${entry.paperId}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-stone-50 transition-colors no-underline"
              >
                <span className="text-[11px] text-stone-400 shrink-0 w-24">
                  {formatShortDate(entry.readAt)}
                </span>
                <span className="text-sm text-stone-800 truncate flex-1">
                  {paper?.title || (historyLoading ? "" : entry.paperId)}
                  {historyLoading && !paper && <span className="inline-block h-3 w-48 bg-stone-100 rounded animate-pulse" />}
                </span>
                {paper?.authors && paper.authors.length > 0 && (
                  <span className="text-[11px] text-stone-400 truncate max-w-[200px] hidden md:block">
                    {paper.authors.slice(0, 2).join(", ")}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
