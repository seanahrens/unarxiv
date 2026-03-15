"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import PaperCard from "@/components/PaperCard";
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
      // ArXiv ID detected — look up or create paper, then redirect
      setPreviewError("");
      const arxivId = extractArxivId(arxivParam);
      if (!arxivId) return;

      setPreviewing(true);
      (async () => {
        try {
          const dbPaper = await fetchPaper(arxivId);
          window.location.href = `/papers/?id=${dbPaper.id}`;
          return;
        } catch {
          // Not in DB — fetch from arXiv and create
        }
        try {
          const meta = await previewPaper(arxivParam);
          const paper = await submitPaper(meta.arxiv_url, meta);
          window.location.href = `/papers/?id=${paper.id}`;
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
          <h2 className="flex items-center gap-2 text-xs font-medium text-stone-400 uppercase tracking-wider mb-4">
            {searchQuery ? (
              `Results for "${searchQuery}"`
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                Popular Paper Narrations
              </>
            )}
          </h2>

          {loading ? (
            <div className="text-center py-16 text-stone-400 text-sm">Loading...</div>
          ) : papers.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              {searchQuery
                ? "No papers found. Try a different search or paste an arXiv URL."
                : "No papers yet. Paste an arXiv URL above to get started!"}
            </div>
          ) : (
            <div className="grid gap-3">
              {papers.map((paper) => (
                <PaperCard key={paper.id} paper={paper} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
