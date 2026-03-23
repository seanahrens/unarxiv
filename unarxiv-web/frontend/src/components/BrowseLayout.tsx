"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import PaperCard from "@/components/PaperCard";
import Paginator from "@/components/Paginator";
import { type Paper } from "@/lib/api";
import { fetchList, getTokenForList, type ListMeta } from "@/lib/lists";
import { Skeleton, PaperCardSkeleton } from "@/components/Skeleton";

const PAGE_SIZE = 6;

interface BrowseLayoutProps {
  collections: ListMeta[];
  /** Initial selection — null = "Newly Added" */
  initialSelectedId: string | null;
  /** Papers for the "Newly Added" view */
  newlyAddedPapers: Paper[];
  /** Initial papers for a pre-selected collection (from server) */
  initialCollectionPapers?: Paper[];
  /** Initial collection metadata (from server) */
  initialCollectionMeta?: { name: string; description: string } | null;
}

export default function BrowseLayout({
  collections,
  initialSelectedId,
  newlyAddedPapers,
  initialCollectionPapers,
  initialCollectionMeta,
}: BrowseLayoutProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [page, setPage] = useState(0);
  const [collectionPapers, setCollectionPapers] = useState<Paper[]>(initialCollectionPapers || []);
  const [collectionMeta, setCollectionMeta] = useState<{ name: string; description: string } | null>(initialCollectionMeta || null);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const fetchedCollections = useRef<Map<string, { papers: Paper[]; meta: { name: string; description: string } }>>(new Map());

  // Sync initial collection data when it arrives (handles async parent loading where
  // initialCollectionPapers may be empty on first render then populated later)
  const initialPapersLen = initialCollectionPapers?.length ?? 0;
  useEffect(() => {
    if (initialSelectedId && initialCollectionPapers && initialCollectionPapers.length > 0 && initialCollectionMeta) {
      fetchedCollections.current.set(initialSelectedId, {
        papers: initialCollectionPapers,
        meta: initialCollectionMeta,
      });
      // Only sync state if we're still viewing the initial collection
      if (selectedId === initialSelectedId) {
        setCollectionPapers(initialCollectionPapers);
        setCollectionMeta(initialCollectionMeta);
      }
    }
  }, [initialSelectedId, initialPapersLen, initialCollectionMeta]);

  const handleSelect = useCallback(async (id: string | null) => {
    setSelectedId(id);
    setPage(0);

    if (id === null) {
      // "Newly Added" — data already available
      setCollectionPapers([]);
      setCollectionMeta(null);
      // If we're on a different route (e.g. /l), do a proper navigation;
      // otherwise just update the URL in-place.
      if (window.location.pathname !== "/") {
        router.push("/");
      } else {
        window.history.pushState({}, "", "/");
      }
      return;
    }

    // Check cache
    const cached = fetchedCollections.current.get(id);
    if (cached) {
      setCollectionPapers(cached.papers);
      setCollectionMeta(cached.meta);
      window.history.pushState({}, "", `/l?id=${id}`);
      return;
    }

    // Fetch collection data
    setLoadingCollection(true);
    window.history.pushState({}, "", `/l?id=${id}`);
    try {
      const data = await fetchList(id);
      const papers = data.papers.filter((p): p is Paper => !("not_found" in p));
      const meta = { name: data.list.name, description: data.list.description };
      fetchedCollections.current.set(id, { papers, meta });
      setCollectionPapers(papers);
      setCollectionMeta(meta);
    } catch {
      setCollectionPapers([]);
      setCollectionMeta(null);
    }
    setLoadingCollection(false);
  }, [router]);

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      if (window.location.pathname === "/l" && id) {
        handleSelect(id);
      } else {
        handleSelect(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [handleSelect]);

  const isNewlyAdded = selectedId === null;
  const activePapers = isNewlyAdded ? newlyAddedPapers : collectionPapers;
  const totalPages = Math.ceil(activePapers.length / PAGE_SIZE);
  const paginatedPapers = activePapers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const isOwner = selectedId ? !!getTokenForList(selectedId) : false;
  const loading = !isNewlyAdded && loadingCollection;

  return (
    <div>
      {/* Mobile: horizontal scrollable pills */}
      <div className="flex lg:hidden overflow-x-auto gap-2 mb-4 pb-2 -mx-2 px-2 scrollbar-hide">
        <button
          data-testid="newly-added-nav"
          onClick={() => handleSelect(null)}
          className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            isNewlyAdded
              ? "bg-stone-900 text-white border-stone-900"
              : "bg-surface text-stone-600 border-stone-300 hover:border-stone-400"
          }`}
        >
          Newly Added
        </button>
        {collections.map((c) => (
          <button
            key={c.id}
            onClick={() => handleSelect(c.id)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedId === c.id
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-surface text-stone-600 border-stone-300 hover:border-stone-400"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Desktop: two-column layout */}
      <div className="flex gap-8">
        {/* Left sidebar — collections list */}
        <nav className="hidden lg:block w-56 flex-shrink-0">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Collections
          </h2>
          <div className="flex flex-col gap-0.5">
            <button
              data-testid="newly-added-nav"
              onClick={() => handleSelect(null)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                isNewlyAdded
                  ? "bg-stone-200 text-stone-900 font-medium"
                  : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-800"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Newly Added
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  selectedId === c.id
                    ? "bg-stone-200 text-stone-900 font-medium"
                    : "text-stone-600 hover:bg-stone-200/50 hover:text-stone-800"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 opacity-50">
                  <path d="M3 6H1v13c0 1.1.9 2 2 2h17v-2H3V6z" />
                  <path d="M21 4h-7l-2-2H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" />
                </svg>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Right content — papers */}
        <div className="flex-1 min-w-0">
          {/* Collection header (when viewing a specific collection) */}
          {collectionMeta && !isNewlyAdded && (
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-stone-900">{collectionMeta.name}</h1>
                {collectionMeta.description && (
                  <p className="text-sm text-stone-500 mt-1 whitespace-pre-wrap leading-relaxed">{collectionMeta.description}</p>
                )}
              </div>
              {isOwner && (
                <button
                  onClick={() => router.push(`/l?id=${selectedId}&edit=1`)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>
          )}

          {/* Section header + pagination */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wider">
              {isNewlyAdded ? "Newly Added" : `${activePapers.length} Paper${activePapers.length !== 1 ? "s" : ""}`}
            </h2>
            {totalPages > 1 && (
              <Paginator page={page} totalPages={totalPages} onChange={setPage} />
            )}
          </div>

          {/* Papers grid */}
          {loading ? (
            <BrowseLayoutPapersSkeleton />
          ) : paginatedPapers.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-stone-400 text-sm">
                {isNewlyAdded ? "No papers yet." : "This collection is empty."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {paginatedPapers.map((paper) => (
                <PaperCard key={paper.id} paper={paper} collectionId={selectedId ?? "home"} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton pieces (co-located so they stay in sync with the layout above) ─

/** Skeleton for the papers grid only (used when switching collections). */
function BrowseLayoutPapersSkeleton() {
  return (
    <div className="grid gap-3">
      <PaperCardSkeleton />
      <PaperCardSkeleton />
      <PaperCardSkeleton />
    </div>
  );
}

/**
 * Full-page skeleton for BrowseLayout — mirrors the two-column desktop layout
 * and horizontal-pill mobile layout. Import this wherever BrowseLayout is used
 * as a loading placeholder so the skeleton stays in sync with the component.
 */
export function BrowseLayoutSkeleton() {
  return (
    <div>
      {/* Mobile: horizontal scrollable pills (mirrors the pill row above) */}
      <div className="flex lg:hidden gap-2 mb-4 overflow-hidden">
        <Skeleton className="rounded-full shrink-0" width="90px" height="28px" />
        <Skeleton className="rounded-full shrink-0" width="80px" height="28px" />
        <Skeleton className="rounded-full shrink-0" width="100px" height="28px" />
      </div>

      {/* Desktop: two-column layout (mirrors the flex gap-8 layout above) */}
      <div className="flex gap-8">
        {/* Left: collections nav (w-56, matches the <nav> above) */}
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

        {/* Right: papers (flex-1, matches the content div above) */}
        <div className="flex-1 min-w-0">
          <Skeleton className="mb-3" width="100px" height="12px" />
          <div className="grid gap-3">
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
