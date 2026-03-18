"use client";

import { useState, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useAudio } from "@/contexts/AudioContext";
import { audioUrl, formatDuration, isInProgress, type Paper } from "@/lib/api";
import PaperActionsMenu from "@/components/PaperActionsMenu";

const SparklesIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
  </svg>
);

const PlayIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="7,3 21,12 7,21" />
  </svg>
);

const PauseIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const ChevronIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/**
 * Unified play/generate button with dropdown menu.
 * Used on both paper detail page (default) and PaperCard (compact).
 *
 * compact=false (default, paper show):
 *   - Play: icon + "Play" + duration, larger font (text-sm)
 *   - Narrate: sparkles icon + "Narrate", larger font (text-sm)
 *
 * compact=true (PaperCard):
 *   - Play: icon only on mobile, icon + "Play" on desktop, less padding
 *   - Narrate: sparkles icon only on mobile, sparkles + "Narrate" on desktop, less padding
 */
export default function PaperActionButton({
  paper,
  compact = false,
  onRate,
  onGenerate,
  generateDisabled,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onMenuToggle,
}: {
  paper: Paper;
  compact?: boolean;
  onRate?: () => void;
  onGenerate?: () => void;
  generateDisabled?: boolean;
  onAddToPlaylist?: (rect?: DOMRect) => void;
  onRemoveFromPlaylist?: (rect?: DOMRect) => void;
  onMenuToggle?: (open: boolean) => void;
}) {
  const { state, actions } = useAudio();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = (open: boolean) => {
    setMenuOpen(open);
    onMenuToggle?.(open);
  };

  useClickOutside(menuRef, () => toggleMenu(false), menuOpen);

  const isComplete = paper.status === "complete";
  const isNotRequested = paper.status === "not_requested";
  const isProcessing = isInProgress(paper.status);

  // Don't render anything if processing (caller handles NarrationProgress)
  if (isProcessing) return null;

  const isGloballyActive = state.paperId === paper.id;
  const isPlaying = isGloballyActive && state.isPlaying;

  const handlePlay = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isGloballyActive) {
      actions.togglePlay();
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("playerbar-play", { detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }));
      actions.loadPaper(paper.id, paper.title, audioUrl(paper.id));
    }
  };

  // Sizing classes
  const btnBase = compact
    ? "inline-flex items-center justify-center gap-1 px-2 h-[32px] text-xs font-medium transition-colors border"
    : "inline-flex items-center justify-center gap-1.5 px-3 h-[42px] text-sm font-medium transition-colors border";

  const wrapperClass = compact
    ? "relative inline-flex shrink-0"
    : "relative inline-flex w-full md:w-auto shrink-0";

  // Color schemes
  const playColors = compact
    ? "text-white bg-stone-500 border-stone-500 hover:bg-stone-600"
    : "text-white bg-stone-900 border-stone-900 hover:bg-stone-700";
  const playChevronBorder = compact ? "border-l-stone-400" : "border-l-stone-700";

  if (isComplete) {
    return (
      <div className={wrapperClass} ref={menuRef}>
        <button
          onClick={handlePlay}
          className={`${btnBase} ${compact ? "" : "min-w-[140px] flex-1 md:flex-initial"} gap-2 ${playColors} rounded-l-xl rounded-r-none`}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
          {!compact && (
            <>
              <span>{isPlaying ? "Pause" : "Play"}</span>
              {paper.duration_seconds && (
                <span className="opacity-70">{formatDuration(paper.duration_seconds)}</span>
              )}
            </>
          )}
        </button>
        <button
          data-testid="open-paper-actions"
          onClick={() => toggleMenu(!menuOpen)}
          className={`${btnBase} ${compact ? "px-1" : "px-1.5"} ${playColors} border-l ${playChevronBorder} rounded-r-xl rounded-l-none -ml-px`}
        >
          <ChevronIcon />
        </button>
        {menuOpen && (
          <PaperActionsMenu
            paper={paper}
            showPlayItem={false}
            onRate={onRate}
            onAddToPlaylist={onAddToPlaylist}
            onRemoveFromPlaylist={onRemoveFromPlaylist}
            onClose={() => toggleMenu(false)}
            containerRef={menuRef}
          />
        )}
      </div>
    );
  }

  if (isNotRequested) {
    return (
      <div className={wrapperClass} ref={menuRef}>
        <button
          onClick={onGenerate}
          disabled={generateDisabled}
          className={`${btnBase} ${compact ? "" : "min-w-[140px] flex-1 md:flex-initial"} gap-2 text-white bg-emerald-600 hover:bg-emerald-700 border-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-l-xl rounded-r-none`}
        >
          <SparklesIcon />
          {!compact && <span>Narrate</span>}
        </button>
        <button
          onClick={() => toggleMenu(!menuOpen)}
          className={`${btnBase} ${compact ? "px-1" : "px-1.5"} text-white bg-emerald-600 hover:bg-emerald-700 border-emerald-700 border-l border-l-emerald-800 rounded-r-xl rounded-l-none -ml-px`}
        >
          <ChevronIcon />
        </button>
        {menuOpen && (
          <PaperActionsMenu
            paper={paper}
            showPlayItem={false}
            onClose={() => toggleMenu(false)}
            containerRef={menuRef}
          />
        )}
      </div>
    );
  }

  return null;
}
