"use client";

import { useState, useEffect, useRef } from "react";
import { fetchPaper, parseEtaSeconds, type Paper } from "@/lib/api";

/** Polling interval in ms for in-progress narrations. */
export const POLL_INTERVAL_MS = 1500;

/** Default ETA shown before backend provides a real estimate. */
const DEFAULT_ETA_SECONDS = 55;

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  preparing: "Scripting",
  generating_audio: "Narrating",
};

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
  // Client-side countdown: smoothly decrement ETA between polls
  const [displayEta, setDisplayEta] = useState<number | null>(null);
  const anchorEtaRef = useRef<number | null>(null);
  const anchorTimeRef = useRef<number>(0);

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

        // Update countdown anchor from server ETA
        const serverEta = parseEtaSeconds(p.progress_detail);
        if (serverEta !== null && serverEta > 0) {
          anchorEtaRef.current = serverEta;
          anchorTimeRef.current = Date.now();
          setDisplayEta(serverEta);
        } else if (serverEta === 0 || p.status === "complete") {
          anchorEtaRef.current = null;
          setDisplayEta(null);
        } else if (anchorEtaRef.current === null && (p.status === "queued" || p.status === "preparing")) {
          // No server ETA yet — start counting down from default estimate
          anchorEtaRef.current = DEFAULT_ETA_SECONDS;
          anchorTimeRef.current = Date.now();
          setDisplayEta(DEFAULT_ETA_SECONDS);
        }

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

  // Countdown timer: tick every second
  useEffect(() => {
    if (displayEta === null || displayEta <= 0) return;
    const timer = setInterval(() => {
      if (anchorEtaRef.current === null) return;
      const elapsed = (Date.now() - anchorTimeRef.current) / 1000;
      const newEta = Math.max(0, Math.round(anchorEtaRef.current - elapsed));
      setDisplayEta(newEta);
    }, 1000);
    return () => clearInterval(timer);
  }, [displayEta]);

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

  // Use client-side countdown in polling mode, fall back to server value in static mode
  let etaText: string | null;
  if (paperId && displayEta !== null && displayEta > 0) {
    etaText = formatEta(displayEta);
  } else {
    const etaSeconds = parseEtaSeconds(detail);
    etaText = (etaSeconds !== null && etaSeconds > 0)
      ? formatEta(etaSeconds)
      : (status === "queued" || status === "preparing")
        ? formatEta(DEFAULT_ETA_SECONDS)
        : null;
  }

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
