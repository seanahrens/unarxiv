"use client";

import { useState, useEffect } from "react";
import { fetchPaper, type Paper } from "@/lib/api";

/** Polling interval in ms for in-progress narrations. */
export const POLL_INTERVAL_MS = 1500;

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  preparing: "Scripting",
  generating_audio: "Narrating",
};

/** Parse "eta:240" → { etaSeconds: 240 } */
function parseEta(detail: string | null): { etaSeconds: number | null } {
  if (!detail) return { etaSeconds: null };
  const etaMatch = detail.match(/eta:(\d+)/);
  if (etaMatch) return { etaSeconds: parseInt(etaMatch[1]) };
  return { etaSeconds: null };
}

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
  const [polledStatus, setPolledStatus] = useState<string | null>(null);
  const [polledDetail, setPolledDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Polling mode: fetch status every POLL_INTERVAL_MS
  useEffect(() => {
    if (!paperId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const p = await fetchPaper(paperId);
        if (cancelled) return;

        setPolledStatus(p.status);
        setPolledDetail(p.progress_detail);
        onStatusChange?.(p);

        if (p.status === "complete") {
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
  const status = paperId ? polledStatus : staticPaper?.status;
  const detail = paperId ? polledDetail : staticPaper?.progress_detail ?? null;
  const errorMsg = paperId ? error : (staticPaper?.status === "failed" ? (staticPaper.error_message || "Narration failed") : null);

  if (errorMsg) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-2xs font-medium text-red-600">Failed</span>
        <span className="text-2xs text-red-400 truncate">{errorMsg}</span>
      </div>
    );
  }

  const label = status ? STATUS_LABELS[status] : null;
  if (!label) return null;

  const { etaSeconds } = parseEta(detail);
  // Show backend ETA during audio generation, or default ~60s estimate for early stages
  const DEFAULT_ETA_SECONDS = 55;
  const etaText = (etaSeconds !== null && etaSeconds > 0)
    ? formatEta(etaSeconds)
    : (status === "queued" || status === "preparing")
      ? formatEta(DEFAULT_ETA_SECONDS)
      : null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-stone-500 font-medium shrink-0">
        {label}{etaText ? ` (${etaText})` : ""}
      </span>
      <div className="flex-1 max-w-[100px] h-1.5 rounded-full bg-stone-100 overflow-hidden">
        <div className="h-full rounded-full progress-flow w-full" />
      </div>
    </div>
  );
}
