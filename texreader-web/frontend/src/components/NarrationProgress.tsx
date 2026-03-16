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

/** Parse "30%|eta:240" → { pct: 30, etaSeconds: 240 } */
function parseProgressDetail(detail: string | null): { pct: number; etaSeconds: number | null } {
  if (!detail) return { pct: 0, etaSeconds: null };
  const parts = detail.split("|");
  const pctMatch = parts[0].match(/^(\d+)%$/);
  const pct = pctMatch ? parseInt(pctMatch[1]) : 0;
  let etaSeconds: number | null = null;
  for (const part of parts) {
    const etaMatch = part.match(/^eta:(\d+)$/);
    if (etaMatch) {
      etaSeconds = parseInt(etaMatch[1]);
    }
  }
  return { pct, etaSeconds };
}

function formatEta(seconds: number): string {
  if (seconds < 60) return "< 1 min remaining";
  const mins = Math.ceil(seconds / 60);
  if (mins === 1) return "~1 min remaining";
  return `~${mins} min remaining`;
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
        <span className="text-[11px] font-medium text-red-600">Failed</span>
        <span className="text-[11px] text-red-400 truncate">{errorMsg}</span>
      </div>
    );
  }

  const label = status ? STATUS_LABELS[status] : null;
  if (!label) return null;

  const { pct, etaSeconds } = parseProgressDetail(detail);
  const etaText = (status === "generating_audio" && etaSeconds !== null && etaSeconds > 0)
    ? formatEta(etaSeconds)
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-stone-500 font-medium shrink-0 w-14">
          {label}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
          <div className="h-full rounded-full progress-flow w-full" />
        </div>
        {status === "generating_audio" && (
          <span className="text-[11px] text-stone-400 font-medium shrink-0 w-8 text-right">
            {pct}%
          </span>
        )}
      </div>
      {etaText && (
        <span className="text-[10px] text-stone-400 pl-16">
          {etaText}
        </span>
      )}
    </div>
  );
}
