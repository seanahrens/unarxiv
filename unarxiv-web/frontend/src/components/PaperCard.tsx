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
      className={`block relative rounded-xl border border-white/10 p-4 signal-card no-underline bg-[#141414] ${isReady ? "border-l-2 border-l-[#00e5cc]" : ""} ${menuOpen ? "z-40" : ""}`}
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
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#606060] hover:text-[#f0f0f0] hover:bg-white/10 transition-colors"
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
        <div className={`shrink-0 mt-0.5 flex flex-col items-center ${isReady ? "text-[#00e5cc]" : isProcessing ? "text-purple-300" : "text-[#606060]"}`}>
          {isReady ? <AudioFileIcon size={34} /> : isProcessing ? <ProcessingFileIcon size={34} /> : <FileIcon size={34} />}
          {isProcessing ? (
            <>
              <div className="w-5 h-1 rounded-full bg-purple-900/50 overflow-hidden mt-1">
                <div className="h-full rounded-full progress-flow-purple w-full" />
              </div>
              <span className="text-3xs text-purple-400 font-medium mt-0.5">{formatEtaShort(paper.progress_detail) || "~55s"}</span>
            </>
          ) : paper.duration_seconds ? (
            <span className="text-3xs text-[#606060] mt-0.5">{formatDurationShort(paper.duration_seconds)}</span>
          ) : null}
        </div>
        {/* Card content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-[#f0f0f0] line-clamp-2 leading-snug pr-6">
              {paper.title || "Untitled"}
            </h3>
            {isFailed && (
              <span className="shrink-0 text-2xs px-2 py-0.5 rounded-full font-medium bg-red-950/50 text-red-400">
                {STATUS_LABELS[paper.status] || paper.status}
              </span>
            )}
          </div>

          <p className="text-xs text-[#808080] mb-2">
            {paper.authors.length > 0 && (
              <span className="text-[#808080]">
                {formatAuthors(paper.authors)}
              </span>
            )}
            {paper.authors.length > 0 && paper.published_date && <span> &middot; </span>}
            {paper.published_date && <span>{formatPaperYear(paper.published_date)}</span>}
          </p>

          {paper.abstract && (
            <p className="text-xs text-[#606060] line-clamp-3 leading-relaxed">
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
