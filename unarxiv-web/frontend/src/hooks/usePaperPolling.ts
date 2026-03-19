"use client";

import { useState, useEffect, useRef } from "react";
import { fetchPaper, fetchPapersBatch, isInProgress, type Paper } from "@/lib/api";

/** Default polling interval for processing papers (10 seconds). */
const POLL_INTERVAL_MS = 10_000;

// ─── Single Paper Polling ──────────────────────────────────────────────────────

/**
 * Polls a single paper's status while it's in a non-terminal state.
 * Returns the latest paper data. Stops polling when status is `complete` or `failed`.
 *
 * @param paper - The paper object (or null). Polling only runs when status is non-terminal.
 * @param intervalMs - Polling interval in milliseconds (default 10s).
 * @returns The latest paper data, updated in-place.
 */
export function usePaperPolling(
  paper: Paper | null,
  intervalMs: number = POLL_INTERVAL_MS
): Paper | null {
  const [latestPaper, setLatestPaper] = useState<Paper | null>(paper);
  const paperRef = useRef(paper);

  // Keep latestPaper in sync when the parent passes a new paper object
  useEffect(() => {
    if (paper && (!paperRef.current || paper.id !== paperRef.current.id || paper.status !== paperRef.current.status)) {
      paperRef.current = paper;
      setLatestPaper(paper);
    }
  }, [paper]);

  useEffect(() => {
    if (!paper || !isInProgress(paper.status)) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const updated = await fetchPaper(paper.id);
        if (cancelled) return;
        setLatestPaper(updated);
        paperRef.current = updated;

        // Stop polling if terminal
        if (!isInProgress(updated.status)) return;
      } catch {
        // Silently retry on next interval
      }
      if (!cancelled) {
        setTimeout(poll, intervalMs);
      }
    };

    // Start first poll after one interval (the initial data is already fresh)
    const timer = setTimeout(poll, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paper?.id, paper?.status, intervalMs]);

  return latestPaper;
}

// ─── Batch Paper Polling ────────────────────────────────────────────────────────

/**
 * Polls a batch of papers, updating only those in non-terminal states.
 * Returns a Map<paperId, Paper> with the latest data. Uses the batch API
 * endpoint for efficiency.
 *
 * @param papers - Array of papers to monitor.
 * @param intervalMs - Polling interval in milliseconds (default 10s).
 * @returns An updated copy of the papers array, with processing papers refreshed.
 */
export function useBatchPaperPolling(
  papers: Paper[],
  intervalMs: number = POLL_INTERVAL_MS
): Paper[] {
  const [latestPapers, setLatestPapers] = useState<Paper[]>(papers);
  const papersRef = useRef(papers);

  // Derive a stable key from in-progress paper IDs + statuses to avoid unnecessary effect restarts
  const inProgressKey = papers
    .filter((p) => isInProgress(p.status))
    .map((p) => `${p.id}:${p.status}`)
    .join(",");

  // Sync when parent changes (new papers loaded, etc.)
  useEffect(() => {
    papersRef.current = papers;
    setLatestPapers(papers);
  }, [papers.length, inProgressKey]);

  useEffect(() => {
    const inProgressIds = papers
      .filter((p) => isInProgress(p.status))
      .map((p) => p.id);
    if (inProgressIds.length === 0) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      try {
        const updated = await fetchPapersBatch(inProgressIds);
        if (cancelled) return;

        const updateMap = new Map(updated.map((p) => [p.id, p]));

        setLatestPapers((prev) =>
          prev.map((p) => updateMap.get(p.id) || p)
        );

        // Update the ref so the "still processing" check below is accurate
        papersRef.current = papersRef.current.map((p) => updateMap.get(p.id) || p);
      } catch {
        // Silently retry on next interval
      }

      if (!cancelled) {
        // Re-check which papers are still in progress after this poll
        const stillProcessing = inProgressIds.some((id) => {
          const p = papersRef.current.find((paper) => paper.id === id);
          return p && isInProgress(p.status);
        });
        if (stillProcessing) {
          setTimeout(poll, intervalMs);
        }
      }
    };

    const timer = setTimeout(poll, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inProgressKey, intervalMs]);

  return latestPapers;
}

