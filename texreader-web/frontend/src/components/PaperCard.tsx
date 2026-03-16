"use client";

import { useRef } from "react";
import Link from "next/link";
import { Paper, formatDuration } from "@/lib/api";

import { usePlaylist } from "@/contexts/PlaylistContext";
import { isRead, markAsUnread } from "@/lib/readStatus";
import AudioFileIcon from "@/components/AudioFileIcon";

interface PaperCardProps {
  paper: Paper;
}

function formatProgress(detail: string | null): string | null {
  if (!detail) return null;
  const match = detail.match(/^chunk (\d+)\/(\d+)$/);
  if (match) {
    const pct = Math.round((parseInt(match[1]) / parseInt(match[2])) * 100);
    return `${pct}%`;
  }
  if (detail === "starting") return "0%";
  return detail;
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function formatYear(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

const STATUS_LABELS: Record<string, string> = {
  not_requested: "",
  queued: "In Progress",
  preparing: "In Progress",
  generating_audio: "In Progress",
  complete: "",
  failed: "Failed",
};

export default function PaperCard({ paper }: PaperCardProps) {
  const isReady = paper.status === "complete";
  const isFailed = paper.status === "failed";
  const isNotRequested = paper.status === "not_requested";
  const isProcessing = !isReady && !isFailed && !isNotRequested;
  const { addToPlaylist, removeFromPlaylist, isInPlaylist } = usePlaylist();
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const removeBtnRef = useRef<HTMLButtonElement>(null);

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRead(paper.id)) {
      if (!confirm("You've already listened to this. Are you sure you want to add it to your playlist? We will unmark it as read.")) return;
      markAsUnread(paper.id);
    }
    const rect = addBtnRef.current?.getBoundingClientRect();
    addToPlaylist(paper.id, rect || undefined);
  };

  const handleRemoveFromPlaylist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = removeBtnRef.current?.getBoundingClientRect();
    removeFromPlaylist(paper.id, rect || undefined);
  };

  const inPlaylist = isReady && isInPlaylist(paper.id);

  return (
    <Link
      href={`/p?id=${paper.id}`}
      className="block relative rounded-xl border p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all no-underline bg-white border-stone-300 hover:border-stone-400"
    >
      {isReady && (
        inPlaylist ? (
          <button
            ref={removeBtnRef}
            onClick={handleRemoveFromPlaylist}
            className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-lg border border-stone-400 bg-stone-300 text-stone-600 hover:bg-stone-400 hover:text-stone-700 transition-colors z-10"
            title="Remove from playlist"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        ) : (
          <button
            ref={addBtnRef}
            onClick={handleAddToPlaylist}
            className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-lg border border-stone-300 text-stone-500 hover:text-stone-700 hover:border-stone-400 hover:bg-stone-50 transition-colors z-10 bg-white"
            title="Add to playlist"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )
      )}
      <div className="flex gap-3">
        {/* File-audio icon */}
        <div className="shrink-0 text-stone-400 mt-0.5">
          <AudioFileIcon size={34} />
        </div>
        {/* Card content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-stone-900 line-clamp-2 leading-snug">
              {paper.title || "Untitled"}
            </h3>
            {!isReady && !isNotRequested && (
              <span
                className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium
                  ${isFailed ? "bg-red-50 text-red-600" : ""}
                  ${isProcessing ? "bg-amber-50 text-amber-600" : ""}
                `}
              >
                {STATUS_LABELS[paper.status] || paper.status}
              </span>
            )}
          </div>

          <p className="text-xs text-stone-500 mb-2 flex items-center gap-1.5 flex-wrap">
            {paper.duration_seconds && (
              <span>{formatDuration(paper.duration_seconds)}</span>
            )}
            {paper.duration_seconds && paper.authors.length > 0 && <span>&middot;</span>}
            {paper.authors.length > 0 && (
              <span className="text-stone-600">
                {paper.authors.slice(0, 3).join(", ")}
                {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
              </span>
            )}
            {(paper.duration_seconds || paper.authors.length > 0) && paper.published_date && <span>&middot;</span>}
            {paper.published_date && <span>{formatYear(paper.published_date)}</span>}
            {paper.progress_detail && isProcessing && (
              <>
                <span>&middot;</span>
                <span className="text-amber-500">{formatProgress(paper.progress_detail)}</span>
              </>
            )}
          </p>

          {paper.abstract && (
            <p className="text-xs text-stone-500 line-clamp-3 leading-relaxed">
              {paper.abstract}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
