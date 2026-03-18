"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

const PAGE_SIZE = 30;

type SortKey = "created_at" | "title" | "rating" | "status";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "complete" | "in_progress" | "failed";

function statusColor(status: string) {
  if (status === "complete") return "bg-emerald-500";
  if (status === "failed") return "bg-red-500";
  return "bg-amber-400";
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="inline ml-0.5">
      {dir === "asc" ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
    </svg>
  );
}

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
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [ratingsModal, setRatingsModal] = useState<{ paperId: string; title: string } | null>(null);
  const [reprocessMenuOpen, setReprocessMenuOpen] = useState(false);
  const reprocessMenuRef = useRef<HTMLDivElement>(null);

  // Filter & sort state
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showLowRated, setShowLowRated] = useState(false);
  const [showYours, setShowYours] = useState(false);

  useEffect(() => {
    if (!reprocessMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (reprocessMenuRef.current && !reprocessMenuRef.current.contains(e.target as Node)) {
        setReprocessMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [reprocessMenuOpen]);

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

  // Filtered → sorted → paginated
  const filtered = useMemo(() => {
    let list = papers;
    if (statusFilter === "complete") list = list.filter((p) => p.status === "complete");
    else if (statusFilter === "failed") list = list.filter((p) => p.status === "failed");
    else if (statusFilter === "in_progress") list = list.filter((p) => !["complete", "failed"].includes(p.status));
    if (showLowRated) list = list.filter((p) => p.has_low_rating);
    if (showYours) list = list.filter((p) => yourPaperIds.has(p.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.title?.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    }
    return list;
  }, [papers, statusFilter, showLowRated, showYours, searchQuery, yourPaperIds]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return dir * (a.title || "").localeCompare(b.title || "");
        case "rating":
          return dir * ((a.avg_rating ?? -1) - (b.avg_rating ?? -1));
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "created_at":
        default:
          return dir * ((a.created_at || "").localeCompare(b.created_at || ""));
      }
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = useMemo(() => sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE), [sorted, safePage]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [statusFilter, searchQuery, showLowRated, showYours, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "created_at" ? "desc" : "asc"); }
  };

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
      prev.size === paginated.length && paginated.every((p) => prev.has(p.id))
        ? new Set()
        : new Set(paginated.map((p) => p.id))
    );
  }, [paginated]);

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

  const handleBulkReprocess = useCallback(async (mode: "full" | "script_only" | "narration_only" = "full") => {
    if (!password || selected.size === 0) return;

    const ids = [...selected];
    setProcessing(new Set(ids));
    setReprocessMenuOpen(false);
    const failed: string[] = [];

    for (const id of ids) {
      try {
        const updated = await reprocessPaperApi(id, password, false, mode);
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

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "complete", label: "Complete" },
    { key: "in_progress", label: "In Progress" },
    { key: "failed", label: "Failed" },
  ];

  const allPageSelected = paginated.length > 0 && paginated.every((p) => selected.has(p.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <a
            href="/admin"
            className="text-sm text-stone-400 hover:text-stone-600 transition-colors mb-2 inline-block"
          >
            &larr; Back to admin
          </a>
          <h1 className="text-2xl font-bold text-stone-900">Curate Papers</h1>
        </div>
        <span className="text-sm text-stone-400">{filtered.length} of {papers.length} papers</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-lg border border-stone-200 overflow-hidden">
          {statusFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === f.key
                  ? "bg-stone-800 text-white"
                  : "bg-white text-stone-500 hover:bg-stone-50"
              } ${f.key !== "all" ? "border-l border-stone-200" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search title or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-white
                     focus:outline-none focus:ring-1 focus:ring-stone-400 w-48"
        />
        <button
          onClick={() => setShowLowRated((v) => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            showLowRated
              ? "bg-orange-50 border-orange-300 text-orange-700"
              : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          Low rated
        </button>
        <button
          onClick={() => setShowYours((v) => !v)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            showYours
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
          }`}
        >
          Yours
        </button>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
          <span className="text-xs text-stone-600 font-medium">{selected.size} selected</span>
          <div className="relative" ref={reprocessMenuRef}>
            <div className="inline-flex rounded-lg border border-amber-200 overflow-hidden">
              <button
                onClick={() => handleBulkReprocess("full")}
                disabled={deleting.size > 0 || processing.size > 0}
                className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50
                           hover:bg-amber-100 transition-colors disabled:opacity-40"
              >
                {processing.size > 0 ? "Reprocessing..." : "Reprocess"}
              </button>
              <button
                onClick={() => setReprocessMenuOpen((v) => !v)}
                disabled={deleting.size > 0 || processing.size > 0}
                className="px-1.5 py-1 text-xs text-amber-700 bg-amber-50 border-l border-amber-200
                           hover:bg-amber-100 transition-colors disabled:opacity-40"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            {reprocessMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-10 min-w-[160px]">
                <button
                  onClick={() => handleBulkReprocess("script_only")}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 rounded-t-lg"
                >
                  Script only
                </button>
                <button
                  onClick={() => handleBulkReprocess("narration_only")}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 rounded-b-lg border-t border-stone-100"
                >
                  Narration only
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleBulkClearReviews}
            disabled={deleting.size > 0 || processing.size > 0}
            className="px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200
                       hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-40"
          >
            Clear Reviews
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={deleting.size > 0 || processing.size > 0}
            className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200
                       hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
          >
            {deleting.size > 0 ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-2.5 py-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-stone-400 text-sm">Loading...</div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 accent-stone-800"
                  />
                </th>
                <th className="px-2 py-2 w-6">
                  {/* Status dot header */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2" className="opacity-60">
                    <circle cx="12" cy="12" r="6" />
                  </svg>
                </th>
                <th className="px-2 py-2 cursor-pointer select-none" onClick={() => handleSort("title")}>
                  <span className="inline-flex items-center gap-1 text-stone-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <SortArrow active={sortKey === "title"} dir={sortDir} />
                  </span>
                </th>
                <th className="px-2 py-2 w-16 cursor-pointer select-none text-center" onClick={() => handleSort("rating")}>
                  <span className="inline-flex items-center gap-1 text-stone-400 justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <SortArrow active={sortKey === "rating"} dir={sortDir} />
                  </span>
                </th>
                <th className="px-2 py-2 w-10 text-center">
                  {/* Script header */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5" className="inline opacity-60">
                    <path d="M4 4h16v16H4z" rx="2" />
                    <path d="M8 8h8M8 12h6" />
                  </svg>
                </th>
                <th className="px-2 py-2 w-8 cursor-pointer select-none text-center" onClick={() => handleSort("created_at")}>
                  <span className="inline-flex items-center gap-0.5 text-stone-400 justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    <SortArrow active={sortKey === "created_at"} dir={sortDir} />
                  </span>
                </th>
                <th className="px-2 py-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-stone-400 text-sm">
                    No papers match filters
                  </td>
                </tr>
              ) : paginated.map((paper) => (
                <tr
                  key={paper.id}
                  className={`border-b border-stone-50 hover:bg-stone-50 transition-colors ${
                    selected.has(paper.id) ? "bg-stone-50" : ""
                  } ${deleting.has(paper.id) || processing.has(paper.id) ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={selected.has(paper.id)}
                      onChange={() => toggleSelect(paper.id)}
                      className="w-3.5 h-3.5 accent-stone-800"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor(paper.status)}`}
                      title={paper.status}
                    />
                  </td>
                  <td className="px-2 py-1.5 max-w-0">
                    <a
                      href={`/p?id=${paper.id}`}
                      className="text-sm text-stone-800 hover:text-stone-600 transition-colors no-underline truncate block"
                      title={`${paper.id} — ${paper.title}`}
                    >
                      {paper.title || "Untitled"}
                    </a>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {paper.rating_count > 0 ? (
                      <button
                        onClick={() => setRatingsModal({ paperId: paper.id, title: paper.title })}
                        className="text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors"
                        title={`${paper.rating_count} rating${paper.rating_count > 1 ? "s" : ""}`}
                      >
                        {paper.avg_rating != null ? paper.avg_rating.toFixed(1) : "—"}
                      </button>
                    ) : (
                      <span className="text-xs text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {(paper.status === "complete" || paper.status === "generating_audio") ? (
                      <a
                        href={`/s?id=${paper.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 transition-colors inline-block"
                        title="View script"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-stone-200">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline opacity-30">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="text-xs text-stone-400">
                      {paper.created_at ? new Date(paper.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {paper.has_low_rating && (
                      <button
                        onClick={() => setRatingsModal({ paperId: paper.id, title: paper.title })}
                        className="text-orange-500 hover:text-orange-600 transition-colors"
                        title="Low rating — click to view"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-100 bg-stone-50">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2.5 py-1 text-xs font-medium text-stone-600 bg-white border border-stone-200
                           rounded-md hover:bg-stone-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-xs text-stone-500">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-2.5 py-1 text-xs font-medium text-stone-600 bg-white border border-stone-200
                           rounded-md hover:bg-stone-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
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
