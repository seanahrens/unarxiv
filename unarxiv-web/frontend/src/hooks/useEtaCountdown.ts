import { useMemo } from "react";

/**
 * Pass-through for server-provided ETA values.
 *
 * Returns the server ETA directly (updated via polling every ~1.5s).
 * Returns null when not narrating or when the server hasn't provided an ETA yet
 * (frontend shows "Estimating..." in that case).
 *
 * No client-side countdown — we only display what the backend tells us.
 */
export function useEtaCountdown(
  serverEta: number | null,
  isNarrating: boolean
): number | null {
  return useMemo(() => {
    if (!isNarrating) return null;
    if (serverEta === null || serverEta < 0) return null;
    return serverEta;
  }, [serverEta, isNarrating]);
}
