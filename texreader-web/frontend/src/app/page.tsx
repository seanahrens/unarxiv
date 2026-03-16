"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import PaperCard from "@/components/PaperCard";
import ArxivCta from "@/components/ArxivCta";
import SiteName from "@/components/SiteName";
import {
  fetchPapers,
  fetchPaper,
  previewPaper,
  submitPaper,
  extractArxivId,
  type Paper,
} from "@/lib/api";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-stone-400">Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const arxivParam = searchParams.get("arxiv") || "";
  const qParam = searchParams.get("q") || "";
  const [papers, setPapers] = useState<Paper[]>([]);
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
        .then((data) => setPapers(data.papers))
        .catch(console.error)
        .finally(() => setLoading(false));

      // Try arXiv lookup — redirect on success, fall back to search results on failure
      (async () => {
        try {
          const dbPaper = await fetchPaper(arxivId);
          window.location.href = `/p?id=${dbPaper.id}`;
          return;
        } catch {
          // Not in DB — fetch from arXiv and create
        }
        try {
          const meta = await previewPaper(arxivParam);
          const paper = await submitPaper(meta.arxiv_url, meta);
          window.location.href = `/p?id=${paper.id}`;
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
        .then((data) => setPapers(data.papers))
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      // No params — show popular papers
      setSearchQuery("");
      setPreviewError("");
      setLoading(true);
      fetchPapers({ sort: "popular" })
        .then((data) => setPapers(data.papers))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [qParam, arxivParam]);

  return (
    <div>
      {/* Previewing spinner */}
      {previewing && (
        <div className="text-center py-10 text-stone-400 text-sm">
          Fetching paper details from arXiv...
        </div>
      )}

      {/* Preview error */}
      {previewError && (
        <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700">{previewError}</p>
        </div>
      )}

      {/* Paper list */}
      {!previewing && (
        <>
          {/* Explainer section — only on default homepage (no search) */}
          {!searchQuery && !loading && (
            <div className="mb-10 max-w-2xl mx-auto text-center">
              <h2 className="text-lg font-semibold text-stone-800 mb-3">
                How does <SiteName /> work?
              </h2>
              <p className="text-sm text-stone-500 leading-relaxed mb-5">
                We are an audio arXiv — a mirrored repository of papers on{" "}
                arXiv in audiobook format. For a paper to be on <SiteName />, it first needs
                to be added.
              </p>
              <p className="text-xs text-stone-400 uppercase tracking-wider mb-1">
                To add a paper, drop the arXiv URL in the search above — or browse to an arXiv.org paper &amp; add &lsquo;un&rsquo; to the URL &amp; hit enter.
              </p>
              <ArxivCta showHeading={false} inlineBrowse staticUrl className="py-0" />
            </div>
          )}

          <h2 className="flex items-center justify-center gap-2 text-sm font-semibold text-stone-600 uppercase tracking-wider mb-4">
            {searchQuery ? (
              `Results for "${searchQuery}"`
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                Our Audio Papers So Far
              </>
            )}
          </h2>

          {loading ? (
            <div className="text-center py-16 text-stone-400 text-sm">Loading...</div>
          ) : papers.length === 0 && !searchQuery ? (
            <ArxivCta />
          ) : (
            <>
              <div className="grid gap-3">
                {papers.map((paper) => (
                  <PaperCard key={paper.id} paper={paper} />
                ))}
              </div>
              {searchQuery && <ArxivCta query={searchQuery} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
