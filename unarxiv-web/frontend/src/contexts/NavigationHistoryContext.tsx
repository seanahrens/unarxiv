"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface NavigationHistory {
  /** The path the user was on before the current one (null on first load) */
  previousPath: string | null;
  /** Human-readable label for the previous path */
  previousLabel: string;
  /** Whether the user arrived here via client-side navigation (vs direct load) */
  hasHistory: boolean;
}

const NavigationHistoryContext = createContext<NavigationHistory>({
  previousPath: null,
  previousLabel: "Papers",
  hasHistory: false,
});

function labelForPath(path: string): string {
  if (path === "/" || path === "") return "Papers";
  if (path.startsWith("/playlist")) return "My Lists";
  if (path.startsWith("/p")) return "Paper";
  if (path.startsWith("/s")) return "Script";
  if (path.startsWith("/l")) return "Collection";
  if (path.startsWith("/about")) return "About";
  if (path.startsWith("/admin")) return "Admin";
  return "Back";
}

export function NavigationHistoryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

  // Track navigation history using state so re-renders happen
  const [history, setHistory] = useState<{ previous: string | null; current: string }>({
    previous: null,
    current: fullPath,
  });

  // Use a ref to avoid setting state during render
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // On first mount, just set the current path
      setHistory({ previous: null, current: fullPath });
      return;
    }

    setHistory((prev) => {
      if (fullPath === prev.current) return prev;
      return { previous: prev.current, current: fullPath };
    });
  }, [fullPath]);

  const previousPath = history.previous;
  const previousLabel = previousPath ? labelForPath(previousPath) : "Papers";
  const hasHistory = previousPath !== null;

  return (
    <NavigationHistoryContext.Provider value={{ previousPath, previousLabel, hasHistory }}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory() {
  return useContext(NavigationHistoryContext);
}
