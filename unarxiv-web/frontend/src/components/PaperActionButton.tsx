"use client";

import { useState, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useAudio } from "@/contexts/AudioContext";
import { audioUrl, formatDuration, isInProgress, type Paper } from "@/lib/api";
import PaperActionsMenu from "@/components/PaperActionsMenu";

const BTN_BASE = "inline-flex items-center justify-center gap-1.5 px-3 h-[42px] text-xs font-medium transition-colors border";

/**
 * Unified play/generate button with dropdown menu for the paper detail page.
 * Renders as:
 * - Play/Pause split button (when audio is complete)
 * - Generate Audio split button (when not requested)
 * - Nothing (when processing — caller renders NarrationProgress separately)
 */
export default function PaperActionButton({
  paper,
  onRate,
  onGenerate,
  generateDisabled,
  onAddToPlaylist,
  onRemoveFromPlaylist,
}: {
  paper: Paper;
  onRate: () => void;
  onGenerate: () => void;
  generateDisabled?: boolean;
  onAddToPlaylist?: (rect?: DOMRect) => void;
  onRemoveFromPlaylist?: (rect?: DOMRect) => void;
}) {
  const { state, actions } = useAudio();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

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

  if (isComplete) {
    return (
      <div className="relative inline-flex w-full md:w-auto shrink-0" ref={menuRef}>
        <button
          onClick={handlePlay}
          className={`${BTN_BASE} min-w-[140px] flex-1 md:flex-initial gap-2 text-white bg-stone-900 border-stone-900 hover:bg-stone-700 rounded-l-xl rounded-r-none`}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="7,3 21,12 7,21" />
            </svg>
          )}
          <span>{isPlaying ? "Pause" : "Play"}</span>
          {paper.duration_seconds && (
            <span className="opacity-70">{formatDuration(paper.duration_seconds)}</span>
          )}
        </button>
        <button
          data-testid="open-paper-actions"
          onClick={() => setMenuOpen(!menuOpen)}
          className={`${BTN_BASE} px-1.5 text-white bg-stone-900 border-stone-900 hover:bg-stone-700 border-l border-l-stone-700 rounded-r-xl rounded-l-none -ml-px`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen && (
          <PaperActionsMenu
            paper={paper}
            showPlayItem={false}
            onRate={onRate}
            onAddToPlaylist={onAddToPlaylist}
            onRemoveFromPlaylist={onRemoveFromPlaylist}
            onClose={() => setMenuOpen(false)}
            containerRef={menuRef}
          />
        )}
      </div>
    );
  }

  if (isNotRequested) {
    return (
      <div className="relative inline-flex w-full md:w-auto shrink-0" ref={menuRef}>
        <button
          onClick={onGenerate}
          disabled={generateDisabled}
          className={`${BTN_BASE} min-w-[140px] flex-1 md:flex-initial gap-2 text-white bg-stone-800 hover:bg-stone-900 border-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-l-xl rounded-r-none`}
        >
          Generate Audio Narration
        </button>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`${BTN_BASE} px-1.5 text-white bg-stone-800 hover:bg-stone-900 border-emerald-700 border-l border-l-emerald-800 rounded-r-xl rounded-l-none -ml-px`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen && (
          <PaperActionsMenu
            paper={paper}
            showPlayItem={false}
            onClose={() => setMenuOpen(false)}
            containerRef={menuRef}
          />
        )}
      </div>
    );
  }

  return null;
}
