"use client";

import { Suspense } from "react";
import PaperPageContent from "./PaperPageContent";

export default function PaperPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-12 text-stone-500">Loading...</div>
      }
    >
      <PaperPageContent />
    </Suspense>
  );
}
