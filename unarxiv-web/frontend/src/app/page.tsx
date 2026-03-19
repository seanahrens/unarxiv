"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import PaperCard from "@/components/PaperCard";
import Paginator from "@/components/Paginator";
import ArxivCta from "@/components/ArxivCta";
import SiteName from "@/components/SiteName";
import HeaderSearchBar from "@/components/HeaderSearchBar";
import BrowseLayout from "@/components/BrowseLayout";
import { PaperCardSkeleton, CollectionSidebarSkeleton } from "@/components/Skeleton";
import {
  fetchPapers,
  fetchPaper,
  previewPaper,
  submitPaper,
  searchArxiv,
  requestNarration,
  extractArxivId,
  formatAuthors,
  formatPaperYear,
  type Paper,
  type ArxivSearchResult,
} from "@/lib/api";
import { fetchRecentLists, type ListMeta } from "@/lib/lists";
import FileIcon from "@/components/FileIcon";
import PaperActionButton from "@/components/PaperActionButton";

const PAGE_SIZE = 6;
const MAX_PAGES = 10;
const SEARCH_PAGE_SIZE = 10;

function HomePageSkeleton() {
  return (
    <div>
      <div className="h-6 mb-6" />
      {/* Search bar placeholder */}
      <div className="bg-stone-200 animate-pulse rounded-xl h-12 mb-6" />
      <div className="h-6" />
      {/* Paper cards skeleton */}
      <div className="flex gap-8">
        <div className="flex-1 min-w-0">
          <div className="bg-stone-200 animate-pulse rounded h-4 w-32 mb-3" />
          <div className="grid gap-3">
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
            <PaperCardSkeleton />
          </div>
        </div>
        <div className="hidden lg:block w-64 flex-shrink-0 space-y-2">
          <div className="bg-stone-200 animate-pulse rounded h-4 w-20 mb-3" />
          <CollectionSidebarSkeleton />
          <CollectionSidebarSkeleton />
          <CollectionSidebarSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomePageSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}

/** A search result card for arXiv-only results (not yet in our DB).
 *  Has the same visual layout as PaperCard with a Narrate action button. */
function ArxivResultCard({
  result,
  onImported,
}: {
  result: ArxivSearchResult;
  onImported?: (paper: Paper) => void;
}) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Once imported, render as a Paper with full actions
  const fakePaper: Paper = paper || {
    id: result.id,
    arxiv_url: result.arxiv_url,
    title: result.title,
    authors: result.authors,
    abstract: result.abstract,
    published_date: result.published_date,
    status: "not_requested" as const,
    error_message: null,
    progress_detail: null,
    audio_url: null,
    audio_size_bytes: null,
    duration_seconds: null,
    created_at: "",
    completed_at: null,
  };

  /** Ensure the arXiv paper exists in our DB. Returns the Paper or null on failure. */
  const ensureImported = async (): Promise<Paper | null> => {
    if (paper) return paper;
    try {
      const imported = await submitPaper(result.arxiv_url);
      setPaper(imported);
      onImported?.(imported);
      return imported;
    } catch {
      return null;
    }
  };

  const handleNarrate = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const imported = await ensureImported();
      if (!imported) { setImporting(false); return; }
      const narrated = await requestNarration(imported.id);
      setPaper(narrated);
      router.push(`/p?id=${imported.id}`);
    } catch {
      setImporting(false);
    }
  };

  return (
    <Link
      href={`/p?id=${result.id}`}
      onClick={async (e) => {
        // If not yet imported, import first then navigate
        if (!paper) {
          e.preventDefault();
          setImporting(true);
          try {
            await submitPaper(result.arxiv_url);
            router.push(`/p?id=${result.id}`);
          } catch {
            setImporting(false);
          }
        }
      }}
      className={`block relative rounded-xl border p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all no-underline bg-white border-stone-300 hover:border-stone-400 ${menuOpen ? "z-40" : ""}`}
    >
      {/* Action button — upper right */}
      <div
        className="absolute top-3 right-3 z-30"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <PaperActionButton
          paper={fakePaper}
          compact
          onGenerate={handleNarrate}
          generateDisabled={importing}
          onMenuToggle={setMenuOpen}
          onEnsureImported={ensureImported}
        />
      </div>

      <div className="flex gap-3">
        <div className="shrink-0 mt-0.5 flex flex-col items-center text-stone-400">
          {importing ? (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-spin text-stone-400">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <FileIcon size={34} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-stone-900 line-clamp-2 leading-snug pr-16 mb-1">
            {result.title || "Untitled"}
          </h3>
          <p className="text-xs text-stone-500 mb-2">
            {result.authors.length > 0 && (
              <span className="text-stone-600">
                {formatAuthors(result.authors)}
              </span>
            )}
            {result.authors.length > 0 && result.published_date && <span> &middot; </span>}
            {result.published_date && <span>{formatPaperYear(result.published_date)}</span>}
          </p>
          {result.abstract && (
            <p className="text-xs text-stone-500 line-clamp-3 leading-relaxed">
              {result.abstract}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Merged search result — either a DB paper or an arXiv-only result. */
type SearchResult =
  | { source: "db"; paper: Paper }
  | { source: "arxiv"; result: ArxivSearchResult };

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const arxivParam = searchParams.get("arxiv") || "";
  const qParam = searchParams.get("q") || "";
  const pageParam = parseInt(searchParams.get("page") || "1");

  const [mergedResults, setMergedResults] = useState<SearchResult[]>([]);
  const [totalArxivResults, setTotalArxivResults] = useState(0);
  const [newPapers, setNewPapers] = useState<Paper[]>([]);
  const [page, setPage] = useState(0);
  const [collections, setCollections] = useState<ListMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // ArXiv import state
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // React to search params
  useEffect(() => {
    if (arxivParam) {
      // ArXiv ID detected — try lookup then create
      setPreviewError("");
      const arxivId = extractArxivId(arxivParam);
      if (!arxivId) return;

      setSearchQuery(arxivParam);
      setPreviewing(true);
      setLoading(true);

      fetchPapers({ q: arxivParam })
        .then((data) => setMergedResults(data.papers.map((p) => ({ source: "db" as const, paper: p }))))
        .catch(console.error)
        .finally(() => setLoading(false));

      (async () => {
        try {
          const dbPaper = await fetchPaper(arxivId);
          router.push(`/p?id=${dbPaper.id}`);
          return;
        } catch {}
        try {
          const meta = await previewPaper(arxivParam);
          const paper = await submitPaper(meta.arxiv_url, meta);
          router.push(`/p?id=${paper.id}`);
        } catch (e: any) {
          setPreviewError(e.message || "Could not fetch paper details");
          setPreviewing(false);
        }
      })();
    } else if (qParam) {
      // Text search — parallel DB + arXiv API search
      setSearchQuery(qParam);
      setPreviewError("");
      setLoading(true);

      const currentPage = Math.max(1, pageParam);

      // DB search only on page 1 (our DB is small; arXiv drives pagination)
      const dbPromise = currentPage === 1
        ? fetchPapers({ q: qParam, per_page: SEARCH_PAGE_SIZE }).catch(() => ({ papers: [] as Paper[] }))
        : Promise.resolve({ papers: [] as Paper[] });

      Promise.all([
        dbPromise,
        searchArxiv(qParam, currentPage, SEARCH_PAGE_SIZE).catch(() => ({ papers: [] as ArxivSearchResult[], total: 0, page: 1, per_page: SEARCH_PAGE_SIZE })),
      ])
        .then(([dbData, arxivData]) => {
          const dbPaperIds = new Set(dbData.papers.map((p) => p.id));

          const dbResults: SearchResult[] = dbData.papers.map((p) => ({ source: "db" as const, paper: p }));

          const arxivResults: SearchResult[] = arxivData.papers
            .filter((r) => !dbPaperIds.has(r.id))
            .map((r) => ({ source: "arxiv" as const, result: r }));

          setMergedResults([...dbResults, ...arxivResults]);
          setTotalArxivResults(arxivData.total);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      // No params — load recent papers + collections
      setSearchQuery("");
      setPreviewError("");
      setMergedResults([]);
      setLoading(true);
      setPage(0);

      Promise.all([
        fetchPapers({ sort: "recent", per_page: PAGE_SIZE * MAX_PAGES, status: "complete" }),
        fetchRecentLists(20),
      ])
        .then(([recentData, recentLists]) => {
          setNewPapers(recentData.papers.filter((p) => p.status === "complete"));
          setCollections(recentLists);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [qParam, arxivParam, pageParam]);

  // Background refresh: re-fetch homepage data every 60s when on the default view
  useEffect(() => {
    const isDefaultView = !qParam && !arxivParam;
    if (!isDefaultView || loading) return;

    const refresh = async () => {
      try {
        const [recentData, recentLists] = await Promise.all([
          fetchPapers({ sort: "recent", per_page: PAGE_SIZE * MAX_PAGES, status: "complete" }),
          fetchRecentLists(20),
        ]);
        setNewPapers(recentData.papers.filter((p) => p.status === "complete"));
        setCollections(recentLists);
      } catch {
        // Silently ignore background refresh errors
      }
    };

    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [qParam, arxivParam, loading]);

  const currentPage = Math.max(1, pageParam);
  const searchTotalPages = Math.max(
    Math.ceil(mergedResults.length / SEARCH_PAGE_SIZE),
    Math.ceil(totalArxivResults / SEARCH_PAGE_SIZE)
  );
  const paginatedResults = mergedResults.slice(0, SEARCH_PAGE_SIZE);

  const totalPages = Math.min(MAX_PAGES, Math.ceil(newPapers.length / PAGE_SIZE));
  const visiblePapers = newPapers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const handlePageChange = useCallback((newPage: number) => {
    const params = new URLSearchParams();
    params.set("q", qParam);
    params.set("page", String(newPage + 1));
    router.push(`/?${params}`);
  }, [qParam, router]);

  return (
    <div>
      <HeaderSearchBar />

      {!searchQuery && <div className="h-6" />}

      {/* Previewing spinner */}
      {previewing && (
        <div className="text-center py-10 text-stone-500 text-sm">
          Fetching paper details from arXiv...
        </div>
      )}

      {/* Preview error */}
      {previewError && (
        <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{previewError}</p>
        </div>
      )}

      {/* Content */}
      {!previewing && (
        <>
          {searchQuery ? (
            <>
              <div className="flex items-center justify-between mt-4 mb-4">
                <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wider">
                  {`Results for "${searchQuery}"`}
                </h2>
                {searchTotalPages > 1 && (
                  <Paginator
                    page={currentPage - 1}
                    totalPages={searchTotalPages}
                    onChange={handlePageChange}
                  />
                )}
              </div>
              {loading ? (
                <div className="grid gap-3">
                  <PaperCardSkeleton />
                  <PaperCardSkeleton />
                  <PaperCardSkeleton />
                </div>
              ) : paginatedResults.length === 0 ? (
                <ArxivCta query={searchQuery} />
              ) : (
                <>
                  <div className="grid gap-3">
                    {paginatedResults.map((item) => {
                      if (item.source === "db") {
                        return <PaperCard key={item.paper.id} paper={item.paper} />;
                      } else {
                        return (
                          <ArxivResultCard
                            key={item.result.id}
                            result={item.result}
                          />
                        );
                      }
                    })}
                  </div>
                  {searchTotalPages > 1 && (
                    <div className="flex justify-center mt-6">
                      <Paginator
                        page={currentPage - 1}
                        totalPages={searchTotalPages}
                        onChange={handlePageChange}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          ) : loading ? (
            <div className="flex gap-8">
              <div className="flex-1 min-w-0">
                <div className="bg-stone-200 animate-pulse rounded h-4 w-32 mb-3" />
                <div className="grid gap-3">
                  <PaperCardSkeleton />
                  <PaperCardSkeleton />
                  <PaperCardSkeleton />
                  <PaperCardSkeleton />
                </div>
              </div>
              <div className="hidden lg:block w-64 flex-shrink-0 space-y-2">
                <div className="bg-stone-200 animate-pulse rounded h-4 w-20 mb-3" />
                <CollectionSidebarSkeleton />
                <CollectionSidebarSkeleton />
                <CollectionSidebarSkeleton />
              </div>
            </div>
          ) : newPapers.length === 0 ? (
            <ArxivCta />
          ) : (
            <BrowseLayout
              collections={collections}
              initialSelectedId={null}
              newlyAddedPapers={newPapers}
            />
          )}
        </>
      )}
    </div>
  );
}
