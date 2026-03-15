"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchAdminStats,
  deletePaperApi,
  reprocessPaperApi,
  fetchPapersForCurate,
  fetchPaperRatings,
  clearPaperRatings,
  type PaperWithRating,
  type AdminRating,
} from "@/lib/api";

function RatingsModal({
  paperId,
  paperTitle,
  password,
  onClose,
}: {
  paperId: string;
  paperTitle: string;
  password: string;
  onClose: () => void;
}) {
  const [ratings, setRatings] = useState<AdminRating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaperRatings(paperId, password)
      .then(setRatings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [paperId, password]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-stone-900 mb-1">Ratings</h3>
        <p className="text-sm text-stone-500 mb-4 truncate">{paperTitle}</p>

        {loading ? (
          <div className="text-center py-8 text-stone-400 text-sm">Loading...</div>
        ) : ratings.length === 0 ? (
          <div className="text-center py-8 text-stone-400 text-sm">No ratings yet</div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-3">
            {ratings.map((r, i) => (
              <div key={i} className="flex gap-3 border-b border-stone-100 pb-3 last:border-0">
                <div className="shrink-0 flex gap-0.5 text-amber-400 pt-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <svg key={s} width="14" height="14" viewBox="0 0 24 24" strokeWidth="1.5">
                      <polygon
                        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                        fill={s <= r.stars ? "currentColor" : "none"}
                        stroke="currentColor"
                      />
                    </svg>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  {r.comment ? (
                    <p className="text-sm text-stone-700">{r.comment}</p>
                  ) : (
                    <p className="text-sm text-stone-400 italic">No comment</p>
                  )}
                  <p className="text-xs text-stone-400 mt-1">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4 pt-3 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CuratePage() {
  const [password, setPassword] = useState<string | null>(null);
  const [papers, setPapers] = useState<PaperWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [yourPaperIds, setYourPaperIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [ratingsModal, setRatingsModal] = useState<{ paperId: string; title: string } | null>(null);

  useEffect(() => {
    const pw = sessionStorage.getItem("admin_password");
    if (!pw) {
      window.location.href = "/admin";
      return;
    }
    setPassword(pw);

    fetchPapersForCurate(pw)
      .then((data) => setPapers(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    fetchAdminStats(pw)
      .then((data) => setYourPaperIds(new Set(data.your_paper_ids)))
      .catch(() => {});
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === papers.length
        ? new Set()
        : new Set(papers.map((p) => p.id))
    );
  }, [papers]);

  const handleBulkDelete = useCallback(async () => {
    if (!password || selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} paper${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;

    const ids = [...selected];
    setDeleting(new Set(ids));
    const failed: string[] = [];

    for (const id of ids) {
      try {
        await deletePaperApi(id, password);
        setPapers((prev) => prev.filter((p) => p.id !== id));
      } catch {
        failed.push(id);
      }
    }

    setSelected(new Set(failed));
    setDeleting(new Set());

    if (failed.length > 0) {
      alert(`Failed to delete ${failed.length} paper(s)`);
    }
  }, [password, selected]);

  const handleBulkReprocess = useCallback(async () => {
    if (!password || selected.size === 0) return;

    const ids = [...selected];
    setProcessing(new Set(ids));
    const failed: string[] = [];

    for (const id of ids) {
      try {
        const updated = await reprocessPaperApi(id, password, false);
        setPapers((prev) => prev.map((p) => (p.id === id ? {
          ...p,
          ...updated,
        } : p)));
      } catch {
        failed.push(id);
      }
    }

    setSelected(new Set());
    setProcessing(new Set());

    if (failed.length > 0) {
      alert(`Failed to reprocess ${failed.length} paper(s)`);
    }
  }, [password, selected]);

  const handleBulkClearReviews = useCallback(async () => {
    if (!password || selected.size === 0) return;
    if (!confirm(`Clear all reviews for ${selected.size} paper${selected.size > 1 ? "s" : ""}?`)) return;

    const ids = [...selected];
    try {
      await clearPaperRatings(ids, password);
      setPapers((prev) => prev.map((p) =>
        ids.includes(p.id)
          ? { ...p, rating_count: 0, avg_rating: null, has_low_rating: false }
          : p
      ));
    } catch {
      alert("Failed to clear reviews");
    }
  }, [password, selected]);

  if (!password) {
    return <div className="text-center py-20 text-stone-400">Redirecting...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <a
            href="/admin"
            className="text-sm text-stone-400 hover:text-stone-600 transition-colors mb-2 inline-block"
          >
            &larr; Back to admin
          </a>
          <h1 className="text-2xl font-bold text-stone-900">Curate Papers</h1>
        </div>
        <span className="text-sm text-stone-400">{papers.length} papers</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 bg-stone-50 border border-stone-200 rounded-lg px-4 py-2.5">
        <span className="text-sm text-stone-600">
          {selected.size > 0 ? `${selected.size} selected` : "None selected"}
        </span>
        <button
          onClick={handleBulkReprocess}
          disabled={selected.size === 0 || deleting.size > 0 || processing.size > 0}
          className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200
                     hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {processing.size > 0 ? "Reprocessing..." : selected.size > 0 ? `Reprocess ${selected.size}` : "Reprocess"}
        </button>
        <button
          onClick={handleBulkClearReviews}
          disabled={selected.size === 0 || deleting.size > 0 || processing.size > 0}
          className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200
                     hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {selected.size > 0 ? `Clear Reviews ${selected.size}` : "Clear Reviews"}
        </button>
        <button
          onClick={handleBulkDelete}
          disabled={selected.size === 0 || deleting.size > 0 || processing.size > 0}
          className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200
                     hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting.size > 0 ? "Deleting..." : selected.size > 0 ? `Delete ${selected.size}` : "Delete"}
        </button>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-4 py-2">
            <input
              type="checkbox"
              checked={papers.length > 0 && selected.size === papers.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-stone-800"
            />
            <span className="text-xs text-stone-400 font-medium">Select all</span>
          </div>
          {papers.map((paper) => (
            <div
              key={paper.id}
              className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 ${
                selected.has(paper.id)
                  ? "border-stone-400"
                  : paper.has_low_rating
                  ? "border-orange-300"
                  : "border-stone-200"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(paper.id)}
                onChange={() => toggleSelect(paper.id)}
                className="w-4 h-4 accent-stone-800 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <a
                  href={`/abs/${paper.id}`}
                  className="text-sm font-medium text-stone-900 hover:text-stone-600 transition-colors no-underline truncate block"
                >
                  {paper.title || "Untitled"}
                </a>
                <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                  <span className="font-mono">{paper.id}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(paper.id);
                      setCopiedId(paper.id);
                      setTimeout(() => setCopiedId((c) => c === paper.id ? null : c), 1500);
                    }}
                    className="text-stone-300 hover:text-stone-500 transition-colors"
                    title="Copy arXiv ID"
                  >
                    {copiedId === paper.id ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    )}
                  </button>
                  <span>&middot;</span>
                  <span className={
                    paper.status === "complete"
                      ? "text-emerald-600"
                      : paper.status === "failed"
                      ? "text-red-600"
                      : "text-amber-600"
                  }>
                    {paper.status}
                  </span>
                  {paper.created_at && (
                    <>
                      <span>&middot;</span>
                      <span>{new Date(paper.created_at).toLocaleDateString()}</span>
                    </>
                  )}
                  {(paper.status === "complete" || paper.status === "generating_audio") && (
                    <>
                      <span>&middot;</span>
                      <a
                        href={`/s?id=${paper.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 transition-colors no-underline font-medium"
                      >
                        Script
                      </a>
                    </>
                  )}
                  {yourPaperIds.has(paper.id) && (
                    <>
                      <span>&middot;</span>
                      <span className="text-blue-600 font-medium">Yours</span>
                    </>
                  )}
                  {paper.rating_count > 0 && (
                    <>
                      <span>&middot;</span>
                      <button
                        onClick={() => setRatingsModal({ paperId: paper.id, title: paper.title })}
                        className="inline-flex items-center gap-0.5 hover:opacity-70 transition-opacity"
                        title="View all ratings"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <span className="text-stone-600 font-medium">
                          {paper.avg_rating != null ? paper.avg_rating.toFixed(1) : "—"}
                        </span>
                        <span className="text-stone-400">({paper.rating_count})</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              {paper.has_low_rating && (
                <button
                  onClick={() => setRatingsModal({ paperId: paper.id, title: paper.title })}
                  className="shrink-0 text-orange-500 hover:text-orange-600 transition-colors p-1"
                  title="Has ratings of 3 stars or below — click to view"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {ratingsModal && password && (
        <RatingsModal
          paperId={ratingsModal.paperId}
          paperTitle={ratingsModal.title}
          password={password}
          onClose={() => setRatingsModal(null)}
        />
      )}
    </div>
  );
}
