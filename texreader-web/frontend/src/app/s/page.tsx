"use client";

import { Suspense } from "react";
import ScriptPageContent from "./ScriptPageContent";

export default function ScriptPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-12 text-stone-400">Loading...</div>
      }
    >
      <ScriptPageContent />
    </Suspense>
  );
}
