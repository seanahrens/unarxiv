"use client";

import { Suspense } from "react";
import { NavigationHistoryProvider } from "@/contexts/NavigationHistoryContext";

export default function NavigationHistoryWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <NavigationHistoryProvider>{children}</NavigationHistoryProvider>
    </Suspense>
  );
}
