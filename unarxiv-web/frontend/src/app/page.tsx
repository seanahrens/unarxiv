"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PaperCard from "@/components/PaperCard";
import Paginator from "@/components/Paginator";
import ArxivCta from "@/components/ArxivCta";
import HeaderSearchBar from "@/components/HeaderSearchBar";
import BrowseLayout, { BrowseLayoutSkeleton } from "@/components/BrowseLayout";
import { PaperCardSkeleton } from "@/components/Skeleton";
import {
  fetchPapers,
  fetchPaper,
  fetchPapersBatch,
  previewPaper,
  submitPaper,
  searchArxiv,
  extractArxivId,
  type Paper,
  type ArxivSearchResult,
} from "@/lib/api";
import { fetchRecentLists, type ListMeta } from "@/lib/lists";
import { useBatchPaperPolling } from "@/hooks/usePaperPolling";

const PAGE_SIZE = 6;
const MAX_PAGES = 10;
const SEARCH_PAGE_SIZE = 10;

function HomePageSkeleton() {
  return (
    <div>
      {/* Search bar — mirrors HeaderSearchBar: max-w-2xl mx-auto, py-3 mb-px wrapper */}
      <div className="max-w-2xl mx-auto px-0 md:px-6 py-3 mb-px">
        <div className="bg-stone-200 animate-pulse rounded-xl h-12" />
      </div>
      <div className="h-6" />
      <BrowseLayoutSkeleton />
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

/** Convert an arXiv search result to a placeholder Paper object. */
function arxivResultToPaper(result: ArxivSearchResult): Paper {
  return {
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

  // Track papers that were imported/narrated from arXiv results (keyed by paper ID)
  const [importedPapers, setImportedPapers] = useState<Record<string, Paper>>({});

  // React to search params
  useEffect(() => {
    setImportedPapers({});
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
        .then(async ([dbData, arxivData]) => {
          const dbPaperIds = new Set(dbData.papers.map((p) => p.id));

          const dbResults: SearchResult[] = dbData.papers.map((p) => ({ source: "db" as const, paper: p }));

          // arXiv results not found by DB text search — batch-check if they exist in our DB
          const arxivOnly = arxivData.papers.filter((r) => !dbPaperIds.has(r.id));
          const knownPapers = await fetchPapersBatch(arxivOnly.map((r) => r.id));
          const knownMap = new Map(knownPapers.map((p) => [p.id, p]));

          const arxivResults: SearchResult[] = arxivOnly.map((r) => {
            const dbPaper = knownMap.get(r.id);
            return dbPaper
              ? { source: "db" as const, paper: dbPaper }
              : { source: "arxiv" as const, result: r };
          });

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

  // Build the list of all known papers for search results (DB papers + imported arxiv papers)
  // and poll any that are in-progress
  const searchPapers: Paper[] = mergedResults.map((item) => {
    if (item.source === "db") return importedPapers[item.paper.id] || item.paper;
    return importedPapers[item.result.id] || arxivResultToPaper(item.result);
  });
  const polledSearchPapers = useBatchPaperPolling(searchPapers);

  // When an arxiv result gets imported or narrated, track it
  const handlePaperChange = useCallback((paper: Paper) => {
    setImportedPapers((prev) => ({ ...prev, [paper.id]: paper }));
  }, []);

  const currentPage = Math.max(1, pageParam);
  const searchTotalPages = Math.max(
    Math.ceil(mergedResults.length / SEARCH_PAGE_SIZE),
    Math.ceil(totalArxivResults / SEARCH_PAGE_SIZE)
  );
  const paginatedResults = polledSearchPapers.slice(0, SEARCH_PAGE_SIZE);

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
                <div className="text-center py-10 text-sm text-stone-500">No results found.</div>
              ) : (
                <>
                  <div className="grid gap-3">
                    {paginatedResults.map((paper, i) => {
                      const item = mergedResults[i];
                      // Only pass arxivUrl if the paper hasn't been imported yet
                      const isUnimported = item?.source === "arxiv" && !importedPapers[item.result.id];
                      return (
                        <PaperCard
                          key={paper.id}
                          paper={paper}
                          arxivUrl={isUnimported ? item.result.arxiv_url : undefined}
                          onPaperChange={handlePaperChange}
                        />
                      );
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
            <BrowseLayoutSkeleton />
          ) : newPapers.length === 0 ? (
            <div className="text-center py-10 text-sm text-stone-500">No papers yet.</div>
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
