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
    <Suspense fallback={<div className="text-center py-12 text-white/50">Loading...</div>}>
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
        <h2 className="text-xs font-semibold text-violet-400 uppercase tracking-widest flex items-center gap-3">
          {title}
          <span className="h-px bg-white/10 w-16" />
        </h2>
        <div className="flex-1 h-px bg-white/10 mx-4" />
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
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mt-4 mb-6 text-center">
          <svg width="20" height="20" viewBox="0 0 640 640" fill="currentColor" className="inline-block align-middle mr-2 text-violet-400">
            <path d="M144 288C144 190.8 222.8 112 320 112C417.2 112 496 190.8 496 288L496 332.8C481.9 324.6 465.5 320 448 320L432 320C405.5 320 384 341.5 384 368L384 496C384 522.5 405.5 544 432 544L448 544C501 544 544 501 544 448L544 288C544 164.3 443.7 64 320 64C196.3 64 96 164.3 96 288L96 448C96 501 139 544 192 544L208 544C234.5 544 256 522.5 256 496L256 368C256 341.5 234.5 320 208 320L192 320C174.5 320 158.1 324.7 144 332.8L144 288zM144 416C144 389.5 165.5 368 192 368L208 368L208 496L192 496C165.5 496 144 474.5 144 448L144 416zM496 416L496 448C496 474.5 474.5 496 448 496L432 496L432 368L448 368C474.5 368 496 389.5 496 416z" />
          </svg>
          Listen to <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" className="font-bold no-underline text-violet-400 hover:text-violet-300 transition-colors">arXiv</a> Papers. Unlimited.<span className="hidden md:inline"> Free.</span>
        </h2>
      )}

      <HeaderSearchBar />

      {!searchQuery && <div className="h-6" />}

      {/* Previewing spinner */}
      {previewing && (
        <div className="text-center py-10 text-white/50 text-sm">
          Fetching paper details from arXiv...
        </div>
      )}

      {/* Preview error */}
      {previewError && (
        <div className="mb-8 bg-red-900/30 border border-red-500/30 rounded-xl p-4">
          <p className="text-sm text-red-300">{previewError}</p>
        </div>
      )}

      {/* Content */}
      {!previewing && (
        <>
          {searchQuery ? (
            <>
              <h2 className="flex items-center justify-center gap-2 text-sm font-semibold text-white/60 uppercase tracking-wider mt-4 mb-4">
                {`Results for "${searchQuery}"`}
              </h2>
              {loading ? (
                <div className="text-center py-16 text-white/50 text-sm">Loading...</div>
              ) : (
                <>
                  <div className="grid gap-3">
                    {searchPapers.map((paper) => (
                      <PaperCard key={paper.id} paper={paper} />
                    ))}
                  </div>
                  <ArxivCta query={searchQuery} />
                </>
              )}
            </>
          ) : loading ? (
            <div className="text-center py-16 text-white/50 text-sm">Loading...</div>
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
