/**
 * Reusable skeleton loading placeholders.
 * Uses Tailwind animate-pulse with the site's stone color palette.
 */

/** A single rectangular skeleton block. */
export function Skeleton({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return (
    <div
      className={`bg-stone-200 animate-pulse rounded ${className}`}
      style={{ width, height }}
    />
  );
}

/** Skeleton that mimics a PaperCard layout. */
export function PaperCardSkeleton() {
  return (
    <div className="rounded-xl border border-stone-300 p-5 bg-white">
      <div className="flex gap-3">
        {/* Icon placeholder */}
        <div className="shrink-0">
          <Skeleton className="rounded" width="34px" height="34px" />
          <Skeleton className="mt-1 mx-auto" width="24px" height="8px" />
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <Skeleton className="mb-2" width="75%" height="14px" />
          <Skeleton className="mb-2" width="50%" height="10px" />
          <Skeleton width="100%" height="10px" />
          <Skeleton className="mt-1" width="85%" height="10px" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton that mimics a PaperListRow in my-papers. */
export function PaperListRowSkeleton() {
  return (
    <div className="flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3">
      <Skeleton className="shrink-0 rounded" width="28px" height="28px" />
      <div className="flex-1 min-w-0">
        <Skeleton className="mb-1" width="60%" height="14px" />
        <Skeleton width="35%" height="10px" />
      </div>
      <Skeleton className="shrink-0 rounded" width="18px" height="18px" />
    </div>
  );
}

/** Skeleton for a collection sidebar item. */
export function CollectionSidebarSkeleton() {
  return (
    <div className="block p-3 bg-white border border-stone-200 rounded-lg">
      <Skeleton className="mb-1" width="70%" height="12px" />
      <Skeleton width="40%" height="10px" />
    </div>
  );
}

/** Skeleton for the paper detail page. */
export function PaperDetailSkeleton() {
  return (
    <div>
      {/* Back button placeholder */}
      <Skeleton className="mb-4 rounded-full" width="120px" height="28px" />
      {/* Title */}
      <Skeleton className="mb-2" width="80%" height="24px" />
      <Skeleton className="mb-3" width="60%" height="24px" />
      {/* Authors / date */}
      <Skeleton className="mb-4" width="45%" height="12px" />
      {/* Abstract */}
      <Skeleton className="mb-1" width="100%" height="14px" />
      <Skeleton className="mb-1" width="95%" height="14px" />
      <Skeleton className="mb-1" width="90%" height="14px" />
      <Skeleton width="70%" height="14px" />
    </div>
  );
}

/** Skeleton for the script page. */
export function ScriptPageSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4" width="80px" height="14px" />
      <Skeleton className="mb-1" width="70%" height="20px" />
      <Skeleton className="mb-6" width="100px" height="12px" />
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
        <Skeleton className="mb-2" width="100%" height="12px" />
        <Skeleton className="mb-2" width="95%" height="12px" />
        <Skeleton className="mb-2" width="88%" height="12px" />
        <Skeleton className="mb-2" width="92%" height="12px" />
        <Skeleton className="mb-2" width="80%" height="12px" />
        <Skeleton width="60%" height="12px" />
      </div>
    </div>
  );
}

/** Skeleton for a section in my-papers (additions, collections, history). */
export function MyPapersSectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-stone-200">
      {Array.from({ length: rows }).map((_, i) => (
        <PaperListRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for collection list page loading. */
export function CollectionPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton width="60%" height="24px" />
      <Skeleton width="40%" height="14px" />
      <div className="grid gap-3 mt-4">
        <PaperCardSkeleton />
        <PaperCardSkeleton />
        <PaperCardSkeleton />
      </div>
    </div>
  );
}
