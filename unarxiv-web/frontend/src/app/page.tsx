"use client";

import { Suspense, useState, useEffect } from "react";
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
  extractArxivId,
  type Paper,
} from "@/lib/api";

const PAGE_SIZE = 3;

export default function HomePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-stone-500">Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}

const SECTION_NUMBERS: Record<string, string> = {
  "Popular": "01",
  "Newly Added": "02",
};

function PaperSection({ title, papers }: { title: string; papers: Paper[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(papers.length / PAGE_SIZE);
  const visible = papers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const sectionNum = SECTION_NUMBERS[title] || "00";

  if (papers.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-4 mb-4">
        <span className="text-3xl font-bold font-[family-name:var(--font-mono-brand)] text-[#d32f2f]">{sectionNum}</span>
        <h2 className="text-lg font-bold uppercase tracking-widest font-[family-name:var(--font-mono-brand)]">{title}</h2>
        <div className="flex-1 h-[2px] bg-black" />
        <Paginator page={page} totalPages={totalPages} onChange={setPage} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((paper) => (
          <PaperCard key={paper.id} paper={paper} />
        ))}
      </div>
    </section>
  );
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const arxivParam = searchParams.get("arxiv") || "";
  const qParam = searchParams.get("q") || "";
  const [searchPapers, setSearchPapers] = useState<Paper[]>([]);
  const [popularPapers, setPopularPapers] = useState<Paper[]>([]);
  const [newPapers, setNewPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // ArXiv state
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // React to search params: load popular papers, search results, or trigger arXiv flow
  useEffect(() => {
    if (arxivParam) {
      // ArXiv ID detected — try lookup, but also run a text search in parallel
      // so we have results to show if the arXiv lookup fails
      setPreviewError("");
      const arxivId = extractArxivId(arxivParam);
      if (!arxivId) return;

      setSearchQuery(arxivParam);
      setPreviewing(true);
      setLoading(true);

      // Run text search in parallel
      fetchPapers({ q: arxivParam })
        .then((data) => setSearchPapers(data.papers))
        .catch(console.error)
        .finally(() => setLoading(false));

      // Try arXiv lookup — redirect on success, fall back to search results on failure
      (async () => {
        try {
          const dbPaper = await fetchPaper(arxivId);
          router.push(`/p?id=${dbPaper.id}`);
          return;
        } catch {
          // Not in DB — fetch from arXiv and create
        }
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
      // Text search
      setSearchQuery(qParam);
      setPreviewError("");
      setLoading(true);
      fetchPapers({ q: qParam })
        .then((data) => setSearchPapers(data.papers))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      // No params — load popular + recent sections
      setSearchQuery("");
      setPreviewError("");
      setLoading(true);

      Promise.all([
        fetchPapers({ sort: "popular", per_page: 9 }),
        fetchPapers({ sort: "recent", per_page: 25 }),
      ])
        .then(([popularData, recentData]) => {
          const popular = popularData.papers;
          setPopularPapers(popular);

          // Deduplicate: remove popular papers from recent, take first 9
          const popularIds = new Set(popular.map((p) => p.id));
          const deduped = recentData.papers.filter((p) => !popularIds.has(p.id));
          setNewPapers(deduped.slice(0, 9));
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [qParam, arxivParam]);

  return (
    <div>
      {!searchQuery && (
        <div className="border-b-2 border-black pb-6 mt-4 mb-6">
          <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-tight font-[family-name:var(--font-mono-brand)] leading-none mb-2">
            LISTEN TO <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" className="text-[#d32f2f] no-underline hover:underline">ARXIV</a> PAPERS.
          </h1>
          <p className="text-lg font-bold uppercase tracking-widest font-[family-name:var(--font-mono-brand)] text-[#444]">
            UNLIMITED. FREE. NARRATED.
          </p>
        </div>
      )}

      <HeaderSearchBar />

      {!searchQuery && <div className="h-6" />}

      {/* Previewing spinner */}
      {previewing && (
        <div className="text-center py-10 text-[#444] text-sm font-[family-name:var(--font-mono-brand)] uppercase tracking-widest">
          Fetching paper details from arXiv...
        </div>
      )}

      {/* Preview error */}
      {previewError && (
        <div className="mb-8 bg-white border-2 border-[#d32f2f] p-4">
          <p className="text-sm text-[#d32f2f] font-[family-name:var(--font-mono-brand)]">{previewError}</p>
        </div>
      )}

      {/* Content */}
      {!previewing && (
        <>
          {searchQuery ? (
            <>
              <div className="flex items-center gap-4 mt-4 mb-4">
                <span className="text-3xl font-bold font-[family-name:var(--font-mono-brand)] text-[#d32f2f]">—</span>
                <h2 className="text-lg font-bold uppercase tracking-widest font-[family-name:var(--font-mono-brand)]">
                  {`Results for "${searchQuery}"`}
                </h2>
                <div className="flex-1 h-[2px] bg-black" />
              </div>
              {loading ? (
                <div className="text-center py-16 text-[#444] text-sm font-[family-name:var(--font-mono-brand)] uppercase tracking-widest">Loading...</div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {searchPapers.map((paper) => (
                      <PaperCard key={paper.id} paper={paper} />
                    ))}
                  </div>
                  <ArxivCta query={searchQuery} />
                </>
              )}
            </>
          ) : loading ? (
            <div className="text-center py-16 text-[#444] text-sm font-[family-name:var(--font-mono-brand)] uppercase tracking-widest">Loading...</div>
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
