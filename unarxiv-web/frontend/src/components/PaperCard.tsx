"use client";

import { memo, useState, useRef } from "react";
import Link from "next/link";
import { useClickOutside } from "@/hooks/useClickOutside";
import { Paper, formatDurationShort, isInProgress, formatAuthors, formatPaperYear } from "@/lib/api";

import AudioFileIcon from "@/components/AudioFileIcon";
import FileIcon from "@/components/FileIcon";
import ProcessingFileIcon from "@/components/ProcessingFileIcon";
import PaperActionsMenu from "@/components/PaperActionsMenu";

interface PaperCardProps {
  paper: Paper;
  onGenerate?: (paperId: string) => void;
  onRate?: (paperId: string) => void;
}

function formatEtaShort(detail: string | null): string | null {
  if (!detail) return null;
  // Parse "eta:240" or legacy "30%|eta:240" format
  const etaMatch = detail.match(/eta:(\d+)/);
  if (etaMatch) {
    const secs = parseInt(etaMatch[1]);
    if (secs <= 0) return null;
    if (secs < 60) return `~${Math.round(secs / 5) * 5}s`;
    const mins = Math.floor(secs / 60);
    return `~${mins}m`;
  }
  return null;
}


const STATUS_LABELS: Record<string, string> = {
  not_requested: "",
  queued: "In Progress",
  preparing: "In Progress",
  generating_audio: "In Progress",
  complete: "",
  failed: "Failed",
};

function PaperCard({ paper, onGenerate, onRate }: PaperCardProps) {
  const isReady = paper.status === "complete";
  const isFailed = paper.status === "failed";
  const isNotRequested = paper.status === "not_requested";
  const isProcessing = isInProgress(paper.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  return (
    <Link
      href={`/p?id=${paper.id}`}
      data-testid="paper-card"
      className={`block relative rounded-xl border p-5 shadow-sm hover:shadow-xl hover:shadow-indigo-950/50 hover:-translate-y-0.5 transition-all no-underline bg-slate-900 border-slate-700 hover:border-indigo-500/50 ${menuOpen ? "z-40" : ""}`}
    >
      {/* Actions dropdown — upper right */}
      <div
        ref={menuRef}
        className="absolute top-2 right-2 z-30"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title="Actions"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen && (
          <PaperActionsMenu
            paper={paper}
            showPlayItem
            showGenerateItem
            onRate={onRate ? () => onRate(paper.id) : undefined}
            onGenerate={onGenerate ? () => onGenerate(paper.id) : undefined}
            onClose={() => setMenuOpen(false)}
            containerRef={menuRef}
          />
        )}
      </div>

      <div className="flex gap-3">
        {/* File-audio icon + duration */}
        <div className={`shrink-0 mt-0.5 flex flex-col items-center ${isProcessing ? "text-violet-400" : "text-slate-500"}`}>
          {isReady ? <AudioFileIcon size={34} /> : isProcessing ? <ProcessingFileIcon size={34} /> : <FileIcon size={34} />}
          {isProcessing ? (
            <>
              <div className="w-5 h-1 rounded-full bg-violet-950 overflow-hidden mt-1">
                <div className="h-full rounded-full progress-flow-purple w-full" />
              </div>
              <span className="text-3xs text-violet-400 font-medium mt-0.5">{formatEtaShort(paper.progress_detail) || "~55s"}</span>
            </>
          ) : paper.duration_seconds ? (
            <span className="text-3xs text-slate-500 mt-0.5">{formatDurationShort(paper.duration_seconds)}</span>
          ) : null}
        </div>
        {/* Card content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-slate-100 line-clamp-2 leading-snug pr-6">
              {paper.title || "Untitled"}
            </h3>
            {isFailed && (
              <span className="shrink-0 text-2xs px-2 py-0.5 rounded-full font-medium bg-red-950 text-red-400">
                {STATUS_LABELS[paper.status] || paper.status}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 mb-2">
            {paper.authors.length > 0 && (
              <span className="text-indigo-400/80">
                {formatAuthors(paper.authors)}
              </span>
            )}
            {paper.authors.length > 0 && paper.published_date && <span> &middot; </span>}
            {paper.published_date && <span>{formatPaperYear(paper.published_date)}</span>}
          </p>

          {paper.abstract && (
            <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
              {paper.abstract}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default memo(PaperCard, (prev, next) =>
  prev.paper.id === next.paper.id && prev.paper.status === next.paper.status
);
