"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import PaperCard from "@/components/PaperCard";
import TurnstileWidget from "@/components/TurnstileWidget";
import {
  fetchPapers,
  fetchPaper,
  previewPaper,
  submitPaper,
  extractArxivId,
  type Paper,
  type ArxivMetadata,
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
  const arxivTriggeredRef = useRef(false);

  const [papers, setPapers] = useState<Paper[]>([]);
  const [allPapers, setAllPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // ArXiv preview/submission state
  const [previewMeta, setPreviewMeta] = useState<ArxivMetadata | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [matchedPapers, setMatchedPapers] = useState<Paper[]>([]);
  const [arxivDetected, setArxivDetected] = useState(false);

  // Load popular papers on mount
  useEffect(() => {
    fetchPapers({ sort: "popular" })
      .then((data) => {
        setPapers(data.papers);
        setAllPapers(data.papers);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      setPreviewMeta(null);
      setPreviewError("");
      setSubmitError("");
      setMatchedPapers([]);
      setArxivDetected(false);

      if (!query.trim()) {
        setLoading(true);
        const data = await fetchPapers({ sort: "popular" });
        setPapers(data.papers);
        setAllPapers(data.papers);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchPapers({ q: query });
        setPapers(data.papers);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleArxivSubmit = useCallback(
    async (input: string) => {
      setSubmitError("");
      setPreviewError("");
      setArxivDetected(true);

      const arxivId = extractArxivId(input);
      if (!arxivId) return;

      // Check in-memory first
      const inMemory = allPapers.filter((p) => p.id === arxivId || p.id.startsWith(arxivId));
      if (inMemory.length > 0) {
        setMatchedPapers(inMemory);
        setPreviewMeta(null);
        return;
      }

      // Check the database for this paper
      setPreviewing(true);
      setMatchedPapers([]);
      setPreviewMeta(null);
      try {
        const dbPaper = await fetchPaper(arxivId);
        // Paper exists in DB — show it directly
        setMatchedPapers([dbPaper]);
        setPreviewing(false);
        return;
      } catch {
        // Not in DB — continue to fetch preview from arXiv
      }

      // Not in DB — fetch preview from arXiv
      try {
        const meta = await previewPaper(input);
        setPreviewMeta(meta);
      } catch (e: any) {
        setPreviewError(e.message || "Could not fetch paper details");
      } finally {
        setPreviewing(false);
      }
    },
    [allPapers]
  );

  // Auto-submit narration as soon as captcha passes
  const handleTurnstileVerify = useCallback(
    async (token: string) => {
      if (!previewMeta || submitting) return;

      setSubmitting(true);
      setSubmitError("");

      try {
        const paper = await submitPaper(previewMeta.arxiv_url, token, previewMeta);
        window.location.href = `/papers/?id=${paper.id}`;
      } catch (e: any) {
        setSubmitError(e.message || "Submission failed");
        setSubmitting(false);
      }
    },
    [previewMeta, submitting]
  );

  // Auto-trigger arXiv flow when ?arxiv= param is present (from /abs/, /html/, /pdf/ redirects)
  useEffect(() => {
    if (arxivParam && !arxivTriggeredRef.current) {
      arxivTriggeredRef.current = true;
      handleArxivSubmit(arxivParam);
    }
  }, [arxivParam, handleArxivSubmit]);

  // Determine what to show below the search bar
  const showPreviewCard = previewMeta !== null;
  const showMatchedCards = matchedPapers.length > 0;
  const showPaperList = !showPreviewCard && !showMatchedCards && !previewing;
  // Hide the search bar hint once we've fetched/found something
  const hideSearchHint = showPreviewCard || showMatchedCards || previewing || previewError !== "";

  return (
    <div>
      <div className="mb-10">
        <SearchBar
          onSearch={handleSearch}
          onArxivSubmit={handleArxivSubmit}
          initialQuery={arxivParam}
          hideHint={hideSearchHint}
          submitDisabled={showPreviewCard || showMatchedCards || previewing}
        />
      </div>

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

      {/* Matched papers from in-memory search */}
      {showMatchedCards && (
        <>
          <h2 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-4">
            Paper found
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 mb-8">
            {matchedPapers.map((paper) => (
              <PaperCard key={paper.id} paper={paper} />
            ))}
          </div>
        </>
      )}

      {/* New paper preview card with metadata + Turnstile */}
      {showPreviewCard && (
        <div className="mb-10 bg-white border border-stone-200 rounded-xl overflow-hidden">
          {/* Paper metadata */}
          <div className="p-6 border-b border-stone-100">
            <h2 className="text-lg font-bold text-stone-900 leading-tight mb-2">
              {previewMeta.title}
            </h2>
            {previewMeta.authors.length > 0 && (
              <p className="text-sm text-stone-500 mb-2">
                {previewMeta.authors.join(", ")}
              </p>
            )}
            {previewMeta.published_date && (
              <p className="text-xs text-stone-400 mb-3">
                {previewMeta.published_date} &middot;{" "}
                <span className="font-mono">{previewMeta.id}</span>
              </p>
            )}
            {previewMeta.abstract && (
              <p className="text-sm text-stone-600 leading-relaxed">
                {previewMeta.abstract}
              </p>
            )}
          </div>

          {/* Narration section */}
          <div className="p-6 bg-stone-50">
            <h3 className="text-base font-semibold text-stone-900 mb-1">
              Narrate this Paper
            </h3>
            <p className="text-sm text-stone-500 mb-5">
              {submitting
                ? "Starting narration..."
                : "Complete the verification below to generate an audio narration."}
            </p>

            {!submitting && (
              <div className="mb-4">
                <TurnstileWidget onVerify={handleTurnstileVerify} />
              </div>
            )}

            {submitting && (
              <div className="flex items-center gap-2 text-sm text-stone-500">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                </svg>
                Submitting...
              </div>
            )}

            {submitError && (
              <p className="text-sm text-red-600 mt-3">{submitError}</p>
            )}
          </div>
        </div>
      )}

      {/* Paper list */}
      {showPaperList && (
        <>
          <h2 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-4">
            {searchQuery ? `Results for "${searchQuery}"` : "Popular Papers"}
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
            <div className="grid gap-3 sm:grid-cols-2">
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
