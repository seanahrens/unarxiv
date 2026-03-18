"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PaperCard from "@/components/PaperCard";
import Paginator from "@/components/Paginator";
import ArxivCta from "@/components/ArxivCta";
import SiteName from "@/components/SiteName";
import HeaderSearchBar from "@/components/HeaderSearchBar";
import {
  fetchPapers,
  fetchPaper,
  previewPaper,
  submitPaper,
  searchArxiv,
  extractArxivId,
  formatAuthors,
  formatPaperYear,
  type Paper,
  type ArxivSearchResult,
} from "@/lib/api";

const PAGE_SIZE = 3;
const SEARCH_PAGE_SIZE = 10;

export default function HomePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-stone-500">Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}

function PaperSection({ title, papers }: { title: string; papers: Paper[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(papers.length / PAGE_SIZE);
  const visible = papers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (papers.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wider">
          {title}
        </h2>
        <Paginator page={page} totalPages={totalPages} onChange={setPage} />
      </div>
      <div className="grid gap-3">
        {visible.map((paper) => (
          <PaperCard key={paper.id} paper={paper} />
        ))}
      </div>
    </section>
  );
}

/** A search result card for arXiv-only results (not yet in our DB). */
function ArxivResultCard({
  result,
  loading,
  onClick,
}: {
  result: ArxivSearchResult;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="block w-full text-left relative rounded-xl border p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all bg-white border-stone-300 hover:border-stone-400"
    >
      <div className="flex gap-3">
        {/* File icon placeholder */}
        <div className="shrink-0 mt-0.5 flex flex-col items-center text-stone-300">
          {loading ? (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-spin text-stone-400">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          )}
        </div>
        {/* Card content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-stone-900 line-clamp-2 leading-snug pr-6 mb-1">
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
    </button>
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
  const [popularPapers, setPopularPapers] = useState<Paper[]>([]);
  const [newPapers, setNewPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);

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

      // Run text search in parallel for fallback
      fetchPapers({ q: arxivParam })
        .then((data) => setMergedResults(data.papers.map((p) => ({ source: "db" as const, paper: p }))))
        .catch(console.error)
        .finally(() => setLoading(false));

      // Try arXiv lookup
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

      Promise.all([
        fetchPapers({ q: qParam, per_page: 50 }).catch(() => ({ papers: [] as Paper[] })),
        searchArxiv(qParam, currentPage, SEARCH_PAGE_SIZE).catch(() => ({ papers: [] as ArxivSearchResult[], total: 0, page: 1, per_page: SEARCH_PAGE_SIZE })),
      ])
        .then(([dbData, arxivData]) => {
          const dbPaperIds = new Set(dbData.papers.map((p) => p.id));

          // DB results first
          const dbResults: SearchResult[] = dbData.papers.map((p) => ({ source: "db" as const, paper: p }));

          // arXiv results, filtered to remove duplicates already in DB
          const arxivResults: SearchResult[] = arxivData.papers
            .filter((r) => !dbPaperIds.has(r.id))
            .map((r) => ({ source: "arxiv" as const, result: r }));

          setMergedResults([...dbResults, ...arxivResults]);
          setTotalArxivResults(arxivData.total);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      // No params — load popular + recent sections
      setSearchQuery("");
      setPreviewError("");
      setMergedResults([]);
      setLoading(true);

      Promise.all([
        fetchPapers({ sort: "popular", per_page: 9 }),
        fetchPapers({ sort: "recent", per_page: 25 }),
      ])
        .then(([popularData, recentData]) => {
          const popular = popularData.papers;
          setPopularPapers(popular);

          const popularIds = new Set(popular.map((p) => p.id));
          const deduped = recentData.papers.filter((p) => !popularIds.has(p.id));
          setNewPapers(deduped.slice(0, 9));
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [qParam, arxivParam, pageParam]);

  const currentPage = Math.max(1, pageParam);
  // Paginate merged results client-side at SEARCH_PAGE_SIZE
  const totalPages = Math.max(
    Math.ceil(mergedResults.length / SEARCH_PAGE_SIZE),
    Math.ceil(totalArxivResults / SEARCH_PAGE_SIZE)
  );
  const paginatedResults = mergedResults.slice(0, SEARCH_PAGE_SIZE);

  const handlePageChange = useCallback((newPage: number) => {
    // newPage is 0-indexed from Paginator
    const params = new URLSearchParams();
    params.set("q", qParam);
    params.set("page", String(newPage + 1));
    router.push(`/?${params}`);
  }, [qParam, router]);

  const handleArxivResultClick = useCallback(async (result: ArxivSearchResult) => {
    setCreatingId(result.id);
    try {
      await submitPaper(result.arxiv_url);
      router.push(`/p?id=${result.id}`);
    } catch (e: any) {
      console.error("Failed to create paper:", e);
      setCreatingId(null);
    }
  }, [router]);

  return (
    <div>
      {!searchQuery && (
        <h2 className="text-sm font-semibold text-stone-600 uppercase tracking-wider mt-4 mb-6 text-center">
          <svg width="20" height="20" viewBox="0 0 640 640" fill="currentColor" className="inline-block align-middle mr-2">
            <path d="M144 288C144 190.8 222.8 112 320 112C417.2 112 496 190.8 496 288L496 332.8C481.9 324.6 465.5 320 448 320L432 320C405.5 320 384 341.5 384 368L384 496C384 522.5 405.5 544 432 544L448 544C501 544 544 501 544 448L544 288C544 164.3 443.7 64 320 64C196.3 64 96 164.3 96 288L96 448C96 501 139 544 192 544L208 544C234.5 544 256 522.5 256 496L256 368C256 341.5 234.5 320 208 320L192 320C174.5 320 158.1 324.7 144 332.8L144 288zM144 416C144 389.5 165.5 368 192 368L208 368L208 496L192 496C165.5 496 144 474.5 144 448L144 416zM496 416L496 448C496 474.5 474.5 496 448 496L432 496L432 368L448 368C474.5 368 496 389.5 496 416z" />
          </svg>
          Listen to <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" className="font-bold no-underline text-stone-600 hover:text-stone-800 transition-colors">arXiv</a> Papers. Unlimited.<span className="hidden md:inline"> Free.</span>
        </h2>
      )}

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
                {totalPages > 1 && (
                  <Paginator
                    page={currentPage - 1}
                    totalPages={totalPages}
                    onChange={handlePageChange}
                  />
                )}
              </div>
              {loading ? (
                <div className="text-center py-16 text-stone-500 text-sm">Loading...</div>
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
                            loading={creatingId === item.result.id}
                            onClick={() => handleArxivResultClick(item.result)}
                          />
                        );
                      }
                    })}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex justify-center mt-6">
                      <Paginator
                        page={currentPage - 1}
                        totalPages={totalPages}
                        onChange={handlePageChange}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          ) : loading ? (
            <div className="text-center py-16 text-stone-500 text-sm">Loading...</div>
          ) : popularPapers.length === 0 && newPapers.length === 0 ? (
            <ArxivCta />
          ) : (
            <div className="flex flex-col gap-8">
              <PaperSection title="Popular" papers={popularPapers} />
              <PaperSection title="Newly Added" papers={newPapers} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
