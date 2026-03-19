"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Paper, submitPaper, requestNarration, formatDurationShort, isInProgress, formatAuthors, formatPaperYear, parseEtaSeconds } from "@/lib/api";

import AudioFileIcon from "@/components/AudioFileIcon";
import FileIcon from "@/components/FileIcon";
import ProcessingFileIcon from "@/components/ProcessingFileIcon";
import PaperActionButton from "@/components/PaperActionButton";

interface PaperCardProps {
  paper: Paper;
  onGenerate?: (paperId: string) => void;
  onRate?: (paperId: string) => void;
  /**
   * When set, the paper is not yet in our DB (arXiv-only search result).
   * Card click will call this to import before navigating, and the narrate
   * button will import + request narration in one flow.
   */
  arxivUrl?: string;
  /** Called when the paper object changes (after import or narration request). */
  onPaperChange?: (paper: Paper) => void;
}

function formatEtaShort(detail: string | null): string | null {
  const secs = parseEtaSeconds(detail);
  if (secs === null || secs <= 0) return null;
  if (secs < 60) return `~${Math.round(secs / 5) * 5}s`;
  return `~${Math.floor(secs / 60)}m`;
}


const STATUS_LABELS: Record<string, string> = {
  not_requested: "",
  queued: "In Progress",
  preparing: "In Progress",
  generating_audio: "In Progress",
  complete: "",
  failed: "Failed",
};

function PaperCard({ paper, onGenerate, onRate, arxivUrl, onPaperChange }: PaperCardProps) {
  const router = useRouter();
  const isReady = paper.status === "complete";
  const isFailed = paper.status === "failed";
  const isNotRequested = paper.status === "not_requested";
  const isProcessing = isInProgress(paper.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Whether this is an arXiv-only result that needs importing before DB actions
  const needsImport = !!arxivUrl && isNotRequested && !paper.created_at;

  /** Ensure the arXiv paper exists in our DB. */
  const ensureImported = async (): Promise<Paper | null> => {
    if (!needsImport) return paper;
    try {
      const imported = await submitPaper(arxivUrl!);
      onPaperChange?.(imported);
      return imported;
    } catch {
      return null;
    }
  };

  /** Import + request narration in one flow. */
  const handleNarrate = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const imported = await ensureImported();
      if (!imported) { setImporting(false); return; }
      const narrated = await requestNarration(imported.id);
      onPaperChange?.(narrated);
    } catch {
      setImporting(false);
    }
  };

  const showImportSpinner = importing && needsImport;

  return (
    <Link
      href={`/p?id=${paper.id}`}
      data-testid="paper-card"
      onClick={needsImport ? async (e) => {
        e.preventDefault();
        setImporting(true);
        try {
          await submitPaper(arxivUrl!);
          router.push(`/p?id=${paper.id}`);
        } catch {
          setImporting(false);
        }
      } : undefined}
      className={`block relative rounded-xl border p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all no-underline bg-white border-stone-300 hover:border-stone-400 ${menuOpen ? "z-40" : ""}`}
    >
      {/* Action button — upper right */}
      {(isReady || isNotRequested || isProcessing) && (
        <div
          className="absolute top-3 right-3 z-30"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <PaperActionButton
            paper={paper}
            compact
            onRate={onRate ? () => onRate(paper.id) : undefined}
            onGenerate={needsImport ? handleNarrate : onGenerate ? () => onGenerate(paper.id) : undefined}
            generateDisabled={importing}
            onMenuToggle={setMenuOpen}
            onEnsureImported={needsImport ? ensureImported : undefined}
          />
        </div>
      )}

      <div className="flex gap-3">
        {/* File-audio icon + duration */}
        <div className={`shrink-0 mt-0.5 flex flex-col items-center ${isProcessing ? "text-purple-300" : "text-stone-400"}`}>
          {showImportSpinner ? (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-spin text-stone-400">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : isReady ? (
            <AudioFileIcon size={34} />
          ) : isProcessing ? (
            <ProcessingFileIcon size={34} />
          ) : (
            <FileIcon size={34} />
          )}
          {isProcessing ? (
            <>
              <div className="w-5 h-1 rounded-full bg-purple-100 overflow-hidden mt-1">
                <div className="h-full rounded-full progress-flow-purple w-full" />
              </div>
              <span className="text-3xs text-purple-300 font-medium mt-0.5">{formatEtaShort(paper.progress_detail) || "~55s"}</span>
            </>
          ) : paper.duration_seconds ? (
            <span className="text-3xs text-stone-400 mt-0.5">{formatDurationShort(paper.duration_seconds)}</span>
          ) : null}
        </div>
        {/* Card content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-stone-900 line-clamp-2 leading-snug pr-20">
              {paper.title || "Untitled"}
            </h3>
            {isFailed && (
              <span className="shrink-0 text-2xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-600">
                {STATUS_LABELS[paper.status] || paper.status}
              </span>
            )}
          </div>

          <p className="text-xs text-stone-500 mb-2">
            {paper.authors.length > 0 && (
              <span className="text-stone-600">
                {formatAuthors(paper.authors)}
              </span>
            )}
            {paper.authors.length > 0 && paper.published_date && <span> &middot; </span>}
            {paper.published_date && <span>{formatPaperYear(paper.published_date)}</span>}
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

export default memo(PaperCard, (prev, next) =>
  prev.paper.id === next.paper.id
  && prev.paper.status === next.paper.status
  && prev.paper.progress_detail === next.paper.progress_detail
  && prev.arxivUrl === next.arxivUrl
);
