import { useState, useEffect, useRef } from "react";

/**
 * Client-side ETA countdown that anchors to server-provided values.
 *
 * - Returns null until the server provides a real ETA (via Modal webhook)
 * - Once a real ETA arrives, ticks down 1/sec between polls
 * - Floors at 5s to avoid showing 0 before completion
 * - Snaps to new serverEta on each poll
 */
export function useEtaCountdown(
  serverEta: number | null,
  isNarrating: boolean
): number | null {
  const [displayEta, setDisplayEta] = useState<number | null>(null);
  const anchorRef = useRef<{ eta: number; time: number } | null>(null);

  // Anchor to server ETA when it changes
  useEffect(() => {
    if (!isNarrating) {
      anchorRef.current = null;
      setDisplayEta(null);
      return;
    }

    if (serverEta !== null && serverEta >= 0) {
      anchorRef.current = { eta: serverEta, time: Date.now() };
      setDisplayEta(serverEta);
    }
  }, [isNarrating, serverEta]);

  // Tick down 1/sec
  useEffect(() => {
    if (!isNarrating) return;
    const timer = setInterval(() => {
      if (!anchorRef.current) return;
      const elapsed = (Date.now() - anchorRef.current.time) / 1000;
      const raw = Math.round(anchorRef.current.eta - elapsed);
      setDisplayEta(Math.max(5, raw));
    }, 1000);
    return () => clearInterval(timer);
  }, [isNarrating]);

  if (!isNarrating) return null;
  return displayEta;
}
