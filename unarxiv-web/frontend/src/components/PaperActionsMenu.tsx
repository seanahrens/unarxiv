"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAudio } from "@/contexts/AudioContext";
import { usePlaylist } from "@/contexts/PlaylistContext";
import { audioUrl, formatDuration, requestNarration, type Paper } from "@/lib/api";
import ListSubmenu from "@/components/ListSubmenu";

function useDownload() {
  const [downloading, setDownloading] = useState(false);

  const download = useCallback(async (url: string, filename: string) => {
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  }, []);

  return { downloading, download };
}

const MENU_ITEM = "w-full flex items-center gap-2 px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors";
const DIVIDER = "border-t border-stone-200 mx-3";

interface PaperActionsMenuProps {
  paper: Paper;
  /** Show "Play Paper" as the first menu item (only shown when paper is complete) */
  showPlayItem?: boolean;
  /** Show "Generate Audio" item (only shown when paper is not_requested) */
  showGenerateItem?: boolean;
  onRate?: () => void;
  onGenerate?: () => void;
  /** Override default playlist add behavior (e.g. for read-status confirmation) */
  onAddToPlaylist?: (rect?: DOMRect) => void;
  onRemoveFromPlaylist?: (rect?: DOMRect) => void;
  onClose: () => void;
  /** Ref to the container for animation rect calculations */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Called before playlist add/narration for arXiv-only papers that need importing first. Returns the imported paper. */
  onEnsureImported?: () => Promise<Paper | null>;
}

export default function PaperActionsMenu({
  paper,
  showPlayItem = false,
  showGenerateItem = false,
  onRate,
  onGenerate,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onClose,
  containerRef,
  onEnsureImported,
}: PaperActionsMenuProps) {
  const router = useRouter();
  const { state, actions } = useAudio();
  const { addToPlaylist, addOrMoveToTop, removeFromPlaylist, isInPlaylist } = usePlaylist();
  const { downloading, download } = useDownload();

  const isComplete = paper.status === "narrated";
  const isNotRequested = paper.status === "unnarrated";
  const inPlaylist = isInPlaylist(paper.id);

  const isGloballyActive = state.paperId === paper.id;
  const isPlaying = isGloballyActive && state.isPlaying;

  const pdfFilename = `${paper.published_date?.slice(0, 4) || ""} - ${paper.title} - ${paper.authors?.[0] || "Unknown"} - unarXiv.org - ${paper.id}.pdf`;
  const mp3Filename = `${paper.published_date?.slice(0, 4) || ""} - ${paper.title} - ${paper.authors?.[0] || "Unknown"} - unarXiv.org - ${paper.id}.mp3`;

  const handlePlaylistToggle = async () => {
    const rect = containerRef?.current?.getBoundingClientRect();
    if (inPlaylist) {
      if (onRemoveFromPlaylist) onRemoveFromPlaylist(rect);
      else removeFromPlaylist(paper.id, rect);
    } else {
      // If paper needs importing (arXiv-only), import first
      if (onEnsureImported) {
        const imported = await onEnsureImported();
        if (!imported) { onClose(); return; }
      }
      if (onAddToPlaylist) onAddToPlaylist(rect);
      else addToPlaylist(paper.id, rect || undefined);
      // Auto-trigger narration for un-narrated papers
      if (isNotRequested) {
        requestNarration(paper.id).catch(() => {});
      }
    }
    onClose();
  };

  const handlePlay = () => {
    if (isGloballyActive) {
      actions.togglePlay();
    } else {
      const rect = containerRef?.current?.getBoundingClientRect();
      if (rect) {
        window.dispatchEvent(new CustomEvent("playerbar-play", { detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } }));
      }
      actions.loadPaper(paper.id, paper.title, audioUrl(paper.id));
      addOrMoveToTop(paper.id, rect || undefined);
    }
    onClose();
  };

  return (
    <div className="absolute top-full right-0 mt-1 bg-surface border border-stone-300 rounded-xl shadow-lg z-50 min-w-[180px] py-1">
      {/* Play Paper — only when showPlayItem AND paper has audio */}
      {showPlayItem && isComplete && (
        <>
          <button onClick={handlePlay} className={MENU_ITEM}>
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
            {isPlaying ? "Pause" : "Play Paper"}
            {!isPlaying && paper.duration_seconds && (
              <span className="text-stone-400 ml-auto">{formatDuration(paper.duration_seconds)}</span>
            )}
          </button>
          <div className={DIVIDER} />
        </>
      )}

      {/* Generate Audio — only when showGenerateItem AND paper not requested */}
      {showGenerateItem && isNotRequested && (
        <>
          <button onClick={() => {
            if (onGenerate) { onGenerate(); }
            else { requestNarration(paper.id).catch(() => {}); router.push(`/p?id=${paper.id}`); }
            onClose();
          }} className={MENU_ITEM}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 010 14.14" />
              <path d="M15.54 8.46a5 5 0 010 7.07" />
            </svg>
            Generate Audio
          </button>
          <div className={DIVIDER} />
        </>
      )}

      {/* Playlist toggle */}
      <button data-testid={inPlaylist ? "remove-from-playlist" : "add-to-playlist"} onClick={handlePlaylistToggle} className={MENU_ITEM}>
        {inPlaylist ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        )}
        {inPlaylist ? "In Playlist" : "Add to Playlist"}
      </button>

      {/* Rate Narration — only when complete */}
      {isComplete && onRate && (
        <>
          <div className={DIVIDER} />
          <button data-testid="rate-narration" onClick={() => { onRate(); onClose(); }} className={MENU_ITEM}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Rate Narration
          </button>
        </>
      )}

      {/* Download Audio — only when complete */}
      {isComplete && (
        <>
          <div className={DIVIDER} />
          <button
            data-testid="download-audio"
            onClick={() => { download(audioUrl(paper.id), mp3Filename); onClose(); }}
            disabled={downloading}
            className={`${MENU_ITEM} disabled:opacity-50`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 010 7.07" />
            </svg>
            Download Audio
          </button>
        </>
      )}

      {/* Download PDF — always */}
      <div className={DIVIDER} />
      <button
        data-testid="download-pdf"
        onClick={() => { download(`https://arxiv.org/pdf/${paper.id}`, pdfFilename); onClose(); }}
        disabled={downloading}
        className={`${MENU_ITEM} disabled:opacity-50`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        Download PDF
      </button>

      {/* View on arXiv — always (uses button+window.open to avoid nested <a> inside Link) */}
      <div className={DIVIDER} />
      <button
        onClick={() => { window.open(paper.arxiv_url, "_blank", "noopener,noreferrer"); onClose(); }}
        className={MENU_ITEM}
      >
        <svg width="14" height="14" viewBox="0 0 74.492 100.25" fill="currentColor">
          <path d="M586.72,255.616a3.377,3.377,0,0,1,.448.031,5.917,5.917,0,0,1,3.581,2.79c.454,1.116.314,2.023-1.315,4.141L563.168,293.6l-8.558-10.047,29.348-26.616a4.406,4.406,0,0,1,2.762-1.321m0-1.5a5.766,5.766,0,0,0-3.69,1.643l-.041.032-.038.035L553.6,282.442l-1.077.977.943,1.107,8.558,10.047,1.145,1.344,1.141-1.348,26.267-31.022.022-.027.022-.028c1.574-2.046,2.327-3.622,1.516-5.619a7.309,7.309,0,0,0-4.779-3.714,5.083,5.083,0,0,0-.64-.043Z" transform="translate(-526.086 -245.559)" />
          <path d="M553.423,284.593l8.977,10.558L597.911,337.9c.873,1.093,1.419,2.186,1.047,3.418a4.092,4.092,0,0,1-2.721,2.837,3.557,3.557,0,0,1-1.045.159,4,4,0,0,1-2.687-1.124L548.01,300.808c-3.5-3.5-2.971-8.151.436-11.558l4.977-4.657m.124-2.17L552.4,283.5l-4.976,4.656c-4.192,4.191-4.372,9.816-.473,13.714l44.521,42.4a5.485,5.485,0,0,0,3.722,1.538,5.1,5.1,0,0,0,1.483-.224,5.59,5.59,0,0,0,3.719-3.838,5.176,5.176,0,0,0-1.31-4.788l-35.53-42.767-8.988-10.571-1.019-1.2Z" transform="translate(-526.086 -245.559)" />
          <path d="M562.4,295.151l9.556,11.5,5.761-5.356a7.926,7.926,0,0,0,.041-11.743l-43.7-41.923s-1.671-2.029-3.437-2.071a4.49,4.49,0,0,0-4.23,2.718c-.688,1.651-.194,2.809,1.315,4.97l29.306,35.565Z" transform="translate(-526.086 -245.559)" />
          <path d="M553.7,306.223l-17.116,21.024c-1.255,1.337-2.032,3.683-1.331,5.367a4.587,4.587,0,0,0,4.287,2.841,4.087,4.087,0,0,0,3.082-1.523l20.328-18.9Z" transform="translate(-526.086 -245.559)" />
        </svg>
        View on arXiv
      </button>

      {/* Collection submenu */}
      <div className={DIVIDER} />
      <ListSubmenu paperId={paper.id} onClose={onClose} onEnsureImported={onEnsureImported} />
    </div>
  );
}
