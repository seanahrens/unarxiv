"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Paper, formatDuration } from "@/lib/api";
import { isRead, markAsRead, markAsUnread } from "@/lib/readStatus";

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
  const [read, setRead] = useState(false);

  useEffect(() => {
    setRead(isRead(paper.id));
  }, [paper.id]);

  return (
    <Link
      href={`/papers/?id=${paper.id}`}
      className={`block relative rounded-xl border p-5 hover:shadow-md transition-all no-underline ${
        read
          ? "bg-emerald-50 border-emerald-300 hover:border-emerald-400"
          : "bg-white border-stone-200 hover:border-stone-300"
      }`}
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (read) {
            markAsUnread(paper.id);
            setRead(false);
          } else {
            markAsRead(paper.id);
            setRead(true);
          }
        }}
        className={`absolute top-3 right-3 cursor-pointer transition-colors ${
          read ? "text-emerald-500 hover:text-emerald-600" : "text-stone-300 hover:text-stone-400"
        }`}
        title={read ? "Mark as unread" : "Mark as read"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
          <polyline points="8 12 11 15 16 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

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
