"use client";

import { Suspense } from "react";
import ScriptPageContent from "./ScriptPageContent";

export default function ScriptPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-12 text-slate-9000">Loading...</div>
      }
    >
      <ScriptPageContent />
    </Suspense>
  );
}
