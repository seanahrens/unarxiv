"use client";

import { useRef } from "react";
import Link from "next/link";
import { Paper, formatDuration } from "@/lib/api";
import { ListPlus, ListMinus } from "lucide-react";
import { usePlaylist } from "@/contexts/PlaylistContext";
import { isRead, markAsUnread } from "@/lib/readStatus";

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
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRead(paper.id)) {
      if (!confirm("You've already listened to this. Are you sure you want to add it to your playlist? We will unmark it as read.")) return;
      markAsUnread(paper.id);
    }
    const rect = btnRef.current?.getBoundingClientRect();
    addToPlaylist(paper.id, rect || undefined);
  };

  const handleRemoveFromPlaylist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromPlaylist(paper.id);
  };

  const inPlaylist = isReady && isInPlaylist(paper.id);

  return (
    <Link
      href={`/abs?id=${paper.id}`}
      className="block relative rounded-xl border p-5 hover:shadow-md transition-all no-underline bg-white border-stone-200 hover:border-stone-300"
    >
      {isReady && (
        inPlaylist ? (
          <button
            onClick={handleRemoveFromPlaylist}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg text-stone-600 bg-stone-200 hover:bg-stone-300 transition-colors z-10"
            title="Remove from playlist"
          >
            <ListMinus size={14} />
          </button>
        ) : (
          <button
            ref={btnRef}
            onClick={handleAddToPlaylist}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg text-stone-300 hover:text-stone-600 hover:bg-stone-100 transition-colors z-10"
            title="Add to playlist"
          >
            <ListPlus size={14} />
          </button>
        )
      )}
      <div className="flex items-start justify-between gap-3 mb-2">
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

      {paper.authors.length > 0 && (
        <p className="text-xs text-stone-500 mb-2">
          {paper.authors.slice(0, 3).join(", ")}
          {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
        </p>
      )}

      {paper.abstract && (
        <p className="text-xs text-stone-400 line-clamp-3 mb-3 leading-relaxed">
          {paper.abstract}
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] text-stone-400">
        <div className="flex items-center gap-2">
          {paper.published_date && <span>{formatShortDate(paper.published_date)}</span>}
          {paper.progress_detail && isProcessing && (
            <>
              <span>&middot;</span>
              <span className="text-amber-500">{formatProgress(paper.progress_detail)}</span>
            </>
          )}
        </div>
        {paper.duration_seconds && (
          <span>{formatDuration(paper.duration_seconds)}</span>
        )}
      </div>
    </Link>
  );
}
