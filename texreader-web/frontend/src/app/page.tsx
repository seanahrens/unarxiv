"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "@/components/SearchBar";
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
  const arxivTriggeredRef = useRef(false);
  const qTriggeredRef = useRef(false);

  const [papers, setPapers] = useState<Paper[]>([]);
  const [allPapers, setAllPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // ArXiv state
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

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
      setPreviewError("");

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
      setPreviewError("");

      const arxivId = extractArxivId(input);
      if (!arxivId) return;

      // Check in-memory first
      const inMemory = allPapers.find((p) => p.id === arxivId);
      if (inMemory) {
        window.location.href = `/papers/?id=${inMemory.id}`;
        return;
      }

      // Check the database
      setPreviewing(true);
      try {
        const dbPaper = await fetchPaper(arxivId);
        // Paper exists in DB — go to paper page
        window.location.href = `/papers/?id=${dbPaper.id}`;
        return;
      } catch {
        // Not in DB — fetch preview from arXiv and create record
      }

      try {
        const meta = await previewPaper(input);
        // Create paper record with not_requested status
        const paper = await submitPaper(meta.arxiv_url, meta);
        window.location.href = `/papers/?id=${paper.id}`;
      } catch (e: any) {
        setPreviewError(e.message || "Could not fetch paper details");
        setPreviewing(false);
      }
    },
    [allPapers]
  );

  // Auto-trigger arXiv flow when ?arxiv= param is present
  useEffect(() => {
    if (arxivParam && !arxivTriggeredRef.current) {
      arxivTriggeredRef.current = true;
      handleArxivSubmit(arxivParam);
    }
  }, [arxivParam, handleArxivSubmit]);

  // Auto-trigger search when ?q= param is present
  useEffect(() => {
    if (qParam && !qTriggeredRef.current) {
      qTriggeredRef.current = true;
      handleSearch(qParam);
    }
  }, [qParam, handleSearch]);

  const hideSearchHint = previewing || previewError !== "";

  return (
    <div>
      <div className="mb-10">
        <SearchBar
          onSearch={handleSearch}
          onArxivSubmit={handleArxivSubmit}
          initialQuery={arxivParam || qParam}
          hideHint={hideSearchHint}
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

      {/* Paper list */}
      {!previewing && (
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
