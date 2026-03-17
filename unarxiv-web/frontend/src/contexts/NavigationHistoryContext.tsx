"use client";

import { createContext, useContext, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function getPageLabel(path: string): string {
  if (path === "/") return "Home";
  if (path.startsWith("/playlist")) return "My Lists";
  if (path.startsWith("/l")) return "Collection";
  if (path.startsWith("/p")) return "Paper";
  if (path.startsWith("/s")) return "Script";
  if (path.startsWith("/about")) return "About";
  return "Home";
}

interface NavigationHistory {
  previousPath: string | null;
  previousLabel: string;
}

const NavigationHistoryContext = createContext<NavigationHistory>({
  previousPath: null,
  previousLabel: "Home",
});

export function NavigationHistoryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previousPathRef = useRef<string | null>(null);
  const currentFullPathRef = useRef<string | null>(null);

  const fullPath = searchParams.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  // Update refs synchronously during render so consumers see correct values
  if (currentFullPathRef.current !== null && currentFullPathRef.current !== fullPath) {
    previousPathRef.current = currentFullPathRef.current;
  }
  currentFullPathRef.current = fullPath;

  const value: NavigationHistory = {
    previousPath: previousPathRef.current,
    previousLabel: previousPathRef.current ? getPageLabel(previousPathRef.current) : "Home",
  };

  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory() {
  return useContext(NavigationHistoryContext);
}
