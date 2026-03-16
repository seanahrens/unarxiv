"use client";

import { useState, useEffect } from "react";
import { fetchPaper, type Paper } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  preparing: "Scripting",
  generating_audio: "Narrating",
};

function parseProgressPercent(detail: string | null): number {
  if (!detail) return 0;
  const match = detail.match(/^chunk (\d+)\/(\d+)$/);
  if (match) return Math.round((parseInt(match[1]) / parseInt(match[2])) * 100);
  return 0;
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

  // Polling mode: fetch status every 3s
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
        setTimeout(poll, 3000);
      } catch {
        if (!cancelled) setTimeout(poll, 5000);
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

  const pct = parseProgressPercent(detail);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-stone-500 font-medium shrink-0 w-14">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
        <div
          className="h-full rounded-full progress-shimmer"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="text-[11px] text-stone-400 font-medium shrink-0 w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}
