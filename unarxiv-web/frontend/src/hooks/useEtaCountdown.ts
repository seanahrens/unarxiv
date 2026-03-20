import { useState, useEffect, useRef } from "react";

const DEFAULT_ETA = 55;
const FLOOR_NO_REAL_ESTIMATE = 45;
const FLOOR_WITH_REAL_ESTIMATE = 5;

/**
 * Client-side ETA countdown that anchors to server-provided values.
 *
 * - Ticks down 1/sec between polls
 * - Floors at 45s until a real server update arrives (i.e. serverEta changes from the initial 55)
 * - Once a real estimate is received, floors at 5s
 * - Snaps to new serverEta on each poll
 */
export function useEtaCountdown(
  serverEta: number | null,
  isNarrating: boolean
): number | null {
  const [displayEta, setDisplayEta] = useState<number>(DEFAULT_ETA);
  const anchorRef = useRef<{ eta: number; time: number } | null>(null);
  const hasRealEstimate = useRef(false);

  // Anchor to server ETA when it changes
  useEffect(() => {
    if (!isNarrating) {
      anchorRef.current = null;
      hasRealEstimate.current = false;
      return;
    }

    if (serverEta !== null && serverEta >= 0) {
      // If serverEta differs from the default 55, it's a real estimate from Modal
      if (serverEta !== DEFAULT_ETA) {
        hasRealEstimate.current = true;
      }
      anchorRef.current = { eta: serverEta, time: Date.now() };
      setDisplayEta(serverEta);
    } else if (!anchorRef.current) {
      anchorRef.current = { eta: DEFAULT_ETA, time: Date.now() };
      setDisplayEta(DEFAULT_ETA);
    }
  }, [isNarrating, serverEta]);

  // Tick down 1/sec
  useEffect(() => {
    if (!isNarrating || !anchorRef.current) return;
    const timer = setInterval(() => {
      if (!anchorRef.current) return;
      const elapsed = (Date.now() - anchorRef.current.time) / 1000;
      const raw = Math.round(anchorRef.current.eta - elapsed);
      const floor = hasRealEstimate.current
        ? FLOOR_WITH_REAL_ESTIMATE
        : FLOOR_NO_REAL_ESTIMATE;
      setDisplayEta(Math.max(floor, raw));
    }, 1000);
    return () => clearInterval(timer);
  }, [isNarrating]);

  if (!isNarrating) return null;
  return displayEta;
}
