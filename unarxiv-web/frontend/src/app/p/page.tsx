"use client";

import { Suspense } from "react";
import PaperPageContent from "./PaperPageContent";

export default function PaperPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-12 text-slate-9000">Loading...</div>
      }
    >
      <PaperPageContent />
    </Suspense>
  );
}
