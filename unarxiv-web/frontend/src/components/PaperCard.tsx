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
      className={`block relative border-2 border-black p-5 bs-card no-underline bg-white ${menuOpen ? "z-40" : ""}`}
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
          className="w-7 h-7 flex items-center justify-center text-[#444] hover:text-black transition-colors"
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
        <div className={`shrink-0 mt-0.5 flex flex-col items-center ${isProcessing ? "text-purple-300" : "text-stone-400"}`}>
          {isReady ? <AudioFileIcon size={34} /> : isProcessing ? <ProcessingFileIcon size={34} /> : <FileIcon size={34} />}
          {isProcessing ? (
            <>
              <div className="w-5 h-1 rounded-full bg-purple-100 overflow-hidden mt-1">
                <div className="h-full rounded-full progress-flow-purple w-full" />
              </div>
              <span className="text-3xs text-purple-300 font-medium mt-0.5">{formatEtaShort(paper.progress_detail) || "~55s"}</span>
            </>
          ) : paper.duration_seconds ? (
            <span className="text-3xs text-[#444] font-[family-name:var(--font-mono-brand)] mt-0.5">{formatDurationShort(paper.duration_seconds)}</span>
          ) : null}
        </div>
        {/* Card content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-sm font-bold text-black leading-tight pr-6 line-clamp-2">
              {paper.title || "Untitled"}
            </h3>
            {isFailed && (
              <span className="shrink-0 text-2xs px-2 py-0.5 font-bold font-[family-name:var(--font-mono-brand)] border border-[#d32f2f] text-[#d32f2f] uppercase">
                {STATUS_LABELS[paper.status] || paper.status}
              </span>
            )}
          </div>

          <p className="text-xs font-[family-name:var(--font-mono-brand)] text-[#444] mb-2">
            {paper.authors.length > 0 && (
              <span className="text-[#444]">
                {formatAuthors(paper.authors)}
              </span>
            )}
            {paper.authors.length > 0 && paper.published_date && <span> &middot; </span>}
            {paper.published_date && <span>{formatPaperYear(paper.published_date)}</span>}
          </p>

          {paper.abstract && (
            <p className="text-xs text-[#444] line-clamp-3 leading-relaxed">
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
