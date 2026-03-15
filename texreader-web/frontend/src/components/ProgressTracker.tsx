"use client";

import { useState, useEffect } from "react";
import { fetchPaper, type Paper } from "@/lib/api";

interface ProgressTrackerProps {
  paperId: string;
  onComplete: (paper: Paper) => void;
  onStatusChange?: (paper: Paper) => void;
}

function formatProgress(detail: string | null): string | null {
  if (!detail) return null;
  const match = detail.match(/^chunk (\d+)\/(\d+)$/);
  if (match) {
    const pct = Math.round((parseInt(match[1]) / parseInt(match[2])) * 100);
    return `${pct}%`;
  }
  if (detail === "starting") return "0%";
  return detail;
}

const STAGES = [
  { key: "queued", label: "Queued" },
  { key: "preparing", label: "Writing Script" },
  { key: "generating_audio", label: "Recording Narration" },
  { key: "complete", label: "Complete" },
];

export default function ProgressTracker({
  paperId,
  onComplete,
  onStatusChange,
}: ProgressTrackerProps) {
  const [status, setStatus] = useState("queued");
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const paper = await fetchPaper(paperId);
        if (cancelled) return;

        setStatus(paper.status);
        setDetail(paper.progress_detail);
        onStatusChange?.(paper);

        if (paper.status === "complete") {
          onComplete(paper);
          return;
        }

        if (paper.status === "failed") {
          setError(paper.error_message || "Narration failed");
          return;
        }

        setTimeout(poll, 3000);
      } catch (e) {
        if (!cancelled) {
          setTimeout(poll, 5000);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [paperId, onComplete, onStatusChange]);

  const currentStageIdx = STAGES.findIndex((s) => s.key === status);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
        <span className="text-xs font-medium text-red-700">Failed</span>
        <span className="text-xs text-red-500 truncate">{error}</span>
      </div>
    );
  }

  const displayStages = STAGES.filter((s) => s.key !== "complete");
  const isGenerating = status === "generating_audio";
  const progressPct = formatProgress(detail);

  return (
    <div className="bg-white border border-stone-200 rounded-xl px-4 py-2.5 shadow-sm">
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .progress-shimmer {
          background: linear-gradient(
            90deg,
            rgb(59 130 246 / 0.15) 0%,
            rgb(59 130 246 / 0.35) 50%,
            rgb(59 130 246 / 0.15) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
      `}</style>
      <div className="flex items-center">
        {displayStages.map((stage, idx) => {
          const isCurrent = stage.key === status;
          const isDone = idx < currentStageIdx;

          return (
            <div key={stage.key} className={`flex items-center ${idx < displayStages.length - 1 ? "flex-1" : ""}`}>
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0
                  ${isDone ? "bg-emerald-500 text-white" : ""}
                  ${isCurrent ? "bg-blue-500 text-white animate-pulse" : ""}
                  ${!isDone && !isCurrent ? "bg-stone-200 text-stone-400" : ""}
                `}
              >
                {isDone ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={`text-xs whitespace-nowrap ml-1.5 ${
                  isCurrent
                    ? "text-blue-700 font-medium"
                    : isDone
                    ? "text-stone-400"
                    : "text-stone-300"
                }`}
              >
                {stage.label}
              </span>
              {/* Animated progress bar between "Generating Audio" label and percentage */}
              {isCurrent && isGenerating && (
                <div className="flex-1 mx-2 h-1.5 rounded-full bg-stone-100 overflow-hidden min-w-[40px]">
                  <div className="h-full rounded-full progress-shimmer" style={{ width: "100%" }} />
                </div>
              )}
              {isCurrent && isGenerating && progressPct && (
                <span className="text-xs text-blue-400 font-medium shrink-0">{progressPct}</span>
              )}
              {isCurrent && !isGenerating && detail && (
                <span className="text-blue-400 text-xs ml-1">({formatProgress(detail)})</span>
              )}
              {idx < displayStages.length - 1 && (
                <div className={`flex-1 h-px mx-2 ${isDone ? "bg-emerald-300" : "bg-stone-200"} ${isCurrent && isGenerating ? "hidden" : ""}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
