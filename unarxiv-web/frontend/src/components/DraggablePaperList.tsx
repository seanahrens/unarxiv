"use client";

import { useState, useRef, useCallback } from "react";
import { useAudio } from "@/contexts/AudioContext";
import { type Paper } from "@/lib/api";
import PaperListRow from "@/components/PaperListRow";

interface DraggablePaperListProps {
  items: string[]; // paper IDs in order
  papers: Record<string, Paper>;
  loading: boolean;
  onReorder: (orderedIds: string[]) => void;
  onRemove: (paperId: string) => void;
  emptyMessage: string;
  emptyAction?: React.ReactNode;
}

export default function DraggablePaperList({
  items,
  papers,
  loading,
  onReorder,
  onRemove,
  emptyMessage,
  emptyAction,
}: DraggablePaperListProps) {
  const { state } = useAudio();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Touch-based reordering for mobile
  const touchItemIdx = useRef<number | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleDragStart = (idx: number) => setDragIdx(idx);

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
    const ids = [...items];
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(idx, 0, moved);
    onReorder(ids);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleTouchStart = (e: React.TouchEvent, idx: number) => {
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.right - touch.clientX > 80) return;
    touchItemIdx.current = idx;
    setDragIdx(idx);
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchItemIdx.current === null) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
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
      const ids = [...items];
      const [moved] = ids.splice(touchItemIdx.current, 1);
      ids.splice(dragOverIdx, 0, moved);
      onReorder(ids);
    }
    touchItemIdx.current = null;
    setDragIdx(null);
    setDragOverIdx(null);
  };

  if (loading) {
    return <div className="text-slate-9000 text-sm py-12 text-center">Loading...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-slate-9000 text-sm py-12 text-center">
        {emptyMessage}
        {emptyAction && <div className="mt-2">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div className="divide-y divide-stone-200">
      {items.map((paperId, idx) => {
        const paper = papers[paperId];
        const isActive = state.paperId === paperId;
        const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;
        const dragAbove = isDragOver && dragIdx !== null && dragIdx > idx;
        const dragBelow = isDragOver && dragIdx !== null && dragIdx < idx;
        const dragClass = [
          dragIdx === idx ? "opacity-30" : "",
          dragAbove ? "border-t-2 !border-t-stone-400" : "",
          dragBelow ? "border-b-2 !border-b-stone-400" : "",
        ].filter(Boolean).join(" ");

        return (
          <div
            key={paperId}
            ref={(el) => { rowRefs.current[idx] = el; }}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={() => handleDrop(idx)}
            onDragEnd={handleDragEnd}
            onTouchStart={(e) => handleTouchStart(e, idx)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {paper ? (
              <PaperListRow
                paper={paper}
                paperId={paperId}
                isActive={isActive && dragIdx !== idx}
                className={dragClass}
                actions={
                  <>
                    <span className="text-slate-500 cursor-grab shrink-0 touch-none">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="4" y1="8" x2="20" y2="8" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="16" x2="20" y2="16" />
                      </svg>
                    </span>
                    <button
                      onClick={() => onRemove(paperId)}
                      className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                      title="Remove"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </>
                }
              />
            ) : (
              <div className={`flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3 transition-colors hover:bg-slate-800 ${dragClass}`}>
                <span className="w-7 h-7 shrink-0 bg-slate-800 rounded animate-pulse" />
                <div className="flex-1 min-w-0">
                  <span className="block h-3 w-48 bg-slate-800 rounded animate-pulse" />
                  <span className="block h-3 w-32 bg-slate-800 rounded animate-pulse mt-1" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
