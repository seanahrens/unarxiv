"use client";

import { useState, useEffect } from "react";
import { useEtaCountdown } from "@/hooks/useEtaCountdown";
import { fetchPaper, isInProgress, type Paper } from "@/lib/api";

/** Polling interval in ms for in-progress narrations. */
export const POLL_INTERVAL_MS = 1500;

function formatEta(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 10) return "a few seconds remaining";
  if (seconds < 60) return `~${Math.round(seconds / 5) * 5}s remaining`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round((seconds % 60) / 10) * 10;
  if (mins === 0) return `~${secs}s remaining`;
  if (secs === 0) return `~${mins}m remaining`;
  return `~${mins}m ${secs}s remaining`;
}

interface NarrationProgressProps {
  /** Pass paperId for polling mode (component fetches status itself). */
  paperId?: string;
  /** Pass paper for static mode (parent controls data, no polling). */
  paper?: Paper;
  onComplete?: (paper: Paper) => void;
  onStatusChange?: (paper: Paper) => void;
}

export default function NarrationProgress({
  paperId,
  paper: staticPaper,
  onComplete,
  onStatusChange,
}: NarrationProgressProps) {
  const [polledPaper, setPolledPaper] = useState<Paper | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Polling mode: fetch status every POLL_INTERVAL_MS
  useEffect(() => {
    if (!paperId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const p = await fetchPaper(paperId);
        if (cancelled) return;

        setPolledPaper(p);
        onStatusChange?.(p);

        if (p.status === "narrated") {
          onComplete?.(p);
          return;
        }
        if (p.status === "failed") {
          setError(p.error_message || "Narration failed");
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [paperId, onComplete, onStatusChange]);

  // Determine current values from either polling or static paper
  const currentPaper = paperId ? polledPaper : staticPaper;
  const status = currentPaper?.status;
  const errorMsg = paperId ? error : (status === "failed" ? (currentPaper?.error_message || "Narration failed") : null);

  const isNarrating = status === "narrating";
  const serverEta = currentPaper?.eta_seconds ?? null;
  const displayEta = useEtaCountdown(serverEta, isNarrating);

  if (errorMsg) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-2xs font-medium text-red-600">Failed</span>
        <span className="text-2xs text-red-400 truncate">{errorMsg}</span>
      </div>
    );
  }

  if (!isNarrating) return null;

  const etaText = displayEta !== null && displayEta > 0 ? formatEta(displayEta) : null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-stone-500 font-medium shrink-0">
        Narrating{etaText ? ` (${etaText})` : ""}
      </span>
      <div className="flex-1 max-w-[100px] h-1.5 rounded-full bg-stone-100 overflow-hidden">
        <div className="h-full rounded-full progress-flow w-full" />
      </div>
    </div>
  );
}
