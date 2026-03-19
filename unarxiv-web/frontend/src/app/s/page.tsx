"use client";

import { Suspense } from "react";
import ScriptPageContent from "./ScriptPageContent";
import { ScriptPageSkeleton } from "@/components/Skeleton";

export default function ScriptPage() {
  return (
    <Suspense fallback={<ScriptPageSkeleton />}>
      <ScriptPageContent />
    </Suspense>
  );
}
