"use client";

import { Suspense } from "react";
import PaperPageContent from "./PaperPageContent";
import { PaperDetailSkeleton } from "@/components/Skeleton";

export default function PaperPage() {
  return (
    <Suspense fallback={<PaperDetailSkeleton />}>
      <PaperPageContent />
    </Suspense>
  );
}
