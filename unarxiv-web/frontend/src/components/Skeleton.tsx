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
    <div className="rounded-xl border border-stone-300 p-5 bg-surface">
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
    <div className="block p-3 bg-surface border border-stone-200 rounded-lg">
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
      {/* Title row — mirrors flex-col md:flex-row layout with action button on desktop */}
      <div className="flex flex-col md:flex-row md:items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <Skeleton className="mb-2" width="80%" height="24px" />
          <Skeleton width="60%" height="24px" />
        </div>
        <Skeleton className="shrink-0 rounded-xl" width="100px" height="36px" />
      </div>
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
    <div className="border border-stone-300 rounded-xl overflow-hidden divide-y divide-stone-200">
      {Array.from({ length: rows }).map((_, i) => (
        <PaperListRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for the inline script content block (used when toggling to script view on paper page). */
export function ScriptContentSkeleton() {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
      <Skeleton className="mb-2" width="100%" height="12px" />
      <Skeleton className="mb-2" width="95%" height="12px" />
      <Skeleton className="mb-2" width="88%" height="12px" />
      <Skeleton className="mb-2" width="92%" height="12px" />
      <Skeleton className="mb-2" width="80%" height="12px" />
      <Skeleton width="60%" height="12px" />
    </div>
  );
}

/** Skeleton for collection list page loading. Mirrors the public list view:
 *  HeaderSearchBar → gap → BrowseLayout (two-column desktop, pills mobile). */
export function CollectionPageSkeleton() {
  return (
    <div>
      {/* Search bar — mirrors HeaderSearchBar: max-w-2xl mx-auto, py-3 mb-px wrapper */}
      <div className="max-w-2xl mx-auto px-0 md:px-6 py-3 mb-px">
        <div className="bg-stone-200 animate-pulse rounded-xl h-12" />
      </div>
      <div className="h-6" />
      {/* Mobile: horizontal scrollable pills */}
      <div className="flex lg:hidden gap-2 mb-4 overflow-hidden">
        <Skeleton className="rounded-full shrink-0" width="100px" height="28px" />
        <Skeleton className="rounded-full shrink-0" width="80px" height="28px" />
        <Skeleton className="rounded-full shrink-0" width="90px" height="28px" />
      </div>
      {/* Desktop: two-column layout — mirrors BrowseLayout flex gap-8 */}
      <div className="flex gap-8">
        {/* Left: collections sidebar (w-56) */}
        <div className="hidden lg:flex w-56 flex-shrink-0 flex-col">
          <Skeleton className="mb-3" width="70px" height="10px" />
          <div className="flex flex-col gap-0.5">
            {[55, 75, 65, 80, 60].map((pct, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <Skeleton className="rounded shrink-0" width="14px" height="14px" />
                <Skeleton width={`${pct}%`} height="12px" />
              </div>
            ))}
          </div>
        </div>
        {/* Right: papers grid (flex-1) */}
        <div className="flex-1 min-w-0">
          <Skeleton className="mb-3" width="100px" height="12px" />
          <div className="grid gap-3">
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
