"use client";

import { useState, useRef, useEffect } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useEtaCountdown } from "@/hooks/useEtaCountdown";
import { useAudio } from "@/contexts/AudioContext";
import { usePlaylist } from "@/contexts/PlaylistContext";
import { audioUrl, formatDuration, isInProgress, getPaperVersions, type Paper, type PaperVersion } from "@/lib/api";
import { getBestTierFromVersions, VOICE_TIERS } from "@/lib/voiceTiers";
import PlusIcons from "@/components/PlusIcons";
import PaperActionsMenu from "@/components/PaperActionsMenu";
import PremiumNarrationModal from "@/components/PremiumNarrationModal";

const SparklesIcon = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
  </svg>
);

const PlayIcon = ({ size = 14, enhanced = false }: { size?: number; enhanced?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    {enhanced ? (
      <>
        <polygon
          points="2,0 22,12 2,24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <polygon points="8,5 18,12 8,19" />
      </>
    ) : (
      <polygon points="7,3 21,12 7,21" />
    )}
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

/** Compute the plus count for the play button from versions list */
function getUpgradePlusCount(versions: PaperVersion[]): number {
  const tier = getBestTierFromVersions(versions);
  return tier.plusCount;
}

function formatEtaShort(seconds: number): string {
  if (seconds <= 0) return "~5s";
  if (seconds < 10) return "~5s";
  if (seconds < 60) return `~${Math.round(seconds / 5) * 5}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round((seconds % 60) / 10) * 10;
  if (secs === 0) return `~${mins}m`;
  return `~${mins}m ${secs}s`;
}

/**
 * Unified play/generate/progress button with dropdown menu.
 * Handles all paper states: narrated, unnarrated, narrating, and failed.
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
  etaSeconds,
  onEnsureImported,
  onToggleScript,
  currentView,
  onPaperUpdated,
}: {
  paper: Paper;
  compact?: boolean;
  onRate?: () => void;
  onGenerate?: (rect?: DOMRect) => void;
  generateDisabled?: boolean;
  onAddToPlaylist?: (rect?: DOMRect) => void;
  onRemoveFromPlaylist?: (rect?: DOMRect) => void;
  onMenuToggle?: (open: boolean) => void;
  /** Override ETA seconds (e.g. from polling countdown). Falls back to paper.eta_seconds. */
  etaSeconds?: number | null;
  /** Called before playlist add/narration for arXiv-only papers that need importing first. */
  onEnsureImported?: () => Promise<Paper | null>;
  /** Toggle between abstract and script view (paper detail page only) */
  onToggleScript?: () => void;
  /** Current view mode — "abstract" or "script" */
  currentView?: "abstract" | "script";
  /** Called when the paper state changes (e.g. after premium upgrade submission) */
  onPaperUpdated?: (paper: Paper) => void;
}) {
  const { state, actions } = useAudio();
  const { addOrMoveToTop } = usePlaylist();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = (open: boolean) => {
    setMenuOpen(open);
    onMenuToggle?.(open);
  };

  useClickOutside(menuRef, () => toggleMenu(false), menuOpen);

  const isNarrated = paper.status === "narrated";
  const isUnnarrated = paper.status === "unnarrated";
  const isFailed = paper.status === "failed";
  const isProcessing = isInProgress(paper.status);

  // Client-side ETA countdown
  const serverEta = etaSeconds ?? paper.eta_seconds;
  const displayEta = useEtaCountdown(serverEta, isProcessing);

  const isGloballyActive = state.paperId === paper.id;
  const isPlaying = isGloballyActive && state.isPlaying;

  const handlePlay = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isGloballyActive) {
      actions.togglePlay();
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("playerbar-play", { detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }));
      actions.loadPaper(paper.id, paper.title, audioUrl(paper.id));
      addOrMoveToTop(paper.id, rect);
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
  const compactColors = "text-stone-700 bg-surface border-stone-300 hover:bg-stone-100 hover:text-stone-900";
  const compactChevronBorder = "border-l-stone-300";

  // Fetch versions to determine upgrade tier and available alternate versions
  const [upgradePlus, setUpgradePlus] = useState(0);
  const [versions, setVersions] = useState<PaperVersion[]>([]);
  useEffect(() => {
    if (paper.status !== "narrated") return;
    if (paper.best_version_id == null) { setUpgradePlus(0); setVersions([]); return; }
    getPaperVersions(paper.id)
      .then((resp) => {
        setUpgradePlus(getUpgradePlusCount(resp.versions));
        if (!compact) setVersions(resp.versions);
      })
      .catch(() => {});
  }, [paper.id, paper.status, paper.best_version_id, compact]);

  const isEnhanced = paper.best_version_id != null;
  const isFullyUpgraded = upgradePlus >= 3;

  const openPremiumModal = () => { setShowPremiumModal(true); toggleMenu(false); };

  if (!isNarrated && !isProcessing && !isUnnarrated && !isFailed) return null;

  return (
    <div className={wrapperClass} ref={menuRef}>
      {/* --- NARRATED: Play button --- */}
      {isNarrated && (() => {
        const colors = compact ? compactColors : "text-white bg-stone-900 border-stone-900 hover:bg-stone-700";
        const chevronBorder = compact ? compactChevronBorder : "border-l-stone-700";
        return (
          <>
            <button
              data-testid={compact ? undefined : "play-paper"}
              onClick={handlePlay}
              className={`${btnBase} ${compact ? "" : "min-w-[140px] flex-1 md:flex-initial"} gap-2 ${colors} rounded-l-xl rounded-r-none`}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon enhanced={upgradePlus > 0} />}
              {!compact && (
                <>
                  <span className="inline-block text-center" style={{ minWidth: "3.2em" }}>{isPlaying ? "Pause" : "Play"}</span>
                  {isEnhanced && (
                    <span className="inline-flex" style={{ minWidth: "1.5em" }}>
                      {upgradePlus > 0 && <PlusIcons count={upgradePlus} size={9} className="text-stone-500" gap="gap-px" />}
                    </span>
                  )}
                  {paper.duration_seconds && (
                    <span className="opacity-70">{formatDuration(paper.duration_seconds)}</span>
                  )}
                </>
              )}
            </button>
            <button
              data-testid="open-paper-actions"
              onClick={() => toggleMenu(!menuOpen)}
              className={`${btnBase} ${compact ? "px-1" : "px-1.5"} ${colors} border-l ${chevronBorder} rounded-r-xl rounded-l-none -ml-px`}
            >
              <ChevronIcon />
            </button>
          </>
        );
      })()}

      {/* --- NARRATING: Spinning sparkles + "Narrating" + ETA --- */}
      {isProcessing && (() => {
        const etaText = displayEta !== null ? formatEtaShort(displayEta) : "estimating...";
        const colors = compact ? compactColors : "text-stone-600 bg-stone-50 border-stone-300 hover:bg-stone-100";
        const chevronBorder = compact ? compactChevronBorder : "border-l-stone-300";
        return (
          <>
            <div
              className={`${btnBase} ${compact ? "h-auto py-1" : "min-w-[140px] flex-1 md:flex-initial h-auto py-1.5"} gap-2 ${colors} rounded-l-xl rounded-r-none cursor-default`}
            >
              <SparklesIcon className="animate-spin" />
              {!compact && (
                <div className="flex flex-col items-start leading-tight">
                  <span>Narrating</span>
                  <span className="text-2xs text-stone-400">{etaText}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => toggleMenu(!menuOpen)}
              className={`${btnBase} ${compact ? "px-1" : "px-1.5 h-auto self-stretch"} ${colors} border-l ${chevronBorder} rounded-r-xl rounded-l-none -ml-px`}
            >
              <ChevronIcon />
            </button>
          </>
        );
      })()}

      {/* --- UNNARRATED or FAILED: Narrate/Retry button --- */}
      {(isUnnarrated || isFailed) && (
        <>
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onGenerate?.(rect);
            }}
            disabled={generateDisabled}
            className={`${btnBase} ${compact ? "" : "min-w-[140px] flex-1 md:flex-initial"} gap-2 ${compactColors} disabled:opacity-50 disabled:cursor-not-allowed rounded-l-xl rounded-r-none`}
          >
            <SparklesIcon />
            {compact ? (
              <span className="hidden md:inline">{isFailed ? "Retry" : "Narrate"}</span>
            ) : (
              <span>{isFailed ? "Retry" : "Narrate"}</span>
            )}
          </button>
          <button
            onClick={() => toggleMenu(!menuOpen)}
            className={`${btnBase} ${compact ? "px-1" : "px-1.5"} ${compactColors} border-l ${compactChevronBorder} rounded-r-xl rounded-l-none -ml-px`}
          >
            <ChevronIcon />
          </button>
        </>
      )}

      {/* Dropdown menu — props differ by state */}
      {menuOpen && (
        <PaperActionsMenu
          paper={paper}
          showPlayItem={false}
          onRate={onRate}
          onAddToPlaylist={onAddToPlaylist}
          onRemoveFromPlaylist={onRemoveFromPlaylist}
          onClose={() => toggleMenu(false)}
          containerRef={menuRef}
          onEnsureImported={onEnsureImported}
          onToggleScript={onToggleScript}
          currentView={currentView}
          onOpenPremiumModal={openPremiumModal}
          hideUpgradeNarration={isFullyUpgraded}
          versions={versions}
          onPlayVersion={(v) => {
            if (v.audio_url) {
              actions.loadPaper(paper.id, paper.title, v.audio_url, true);
              addOrMoveToTop(paper.id);
            }
            toggleMenu(false);
          }}
        />
      )}

      {/* Premium narration modal — shared across all states */}
      {showPremiumModal && (
        <PremiumNarrationModal
          paper={paper}
          onClose={() => setShowPremiumModal(false)}
          onSuccess={onPaperUpdated}
        />
      )}
    </div>
  );
}
