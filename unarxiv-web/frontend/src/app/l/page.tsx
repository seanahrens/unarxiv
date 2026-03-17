"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import {
  saveListToken,
  removeListToken,
  getTokenForList,
  updateListTokenName,
  fetchList,
  updateListApi,
  deleteListApi,
  removeItemFromList,
  reorderListApi,
  importBulk,
  type ListWithPapers,
  type ImportResult,
} from "@/lib/lists";
import { type Paper } from "@/lib/api";
import PaperCard from "@/components/PaperCard";
import DraggablePaperList from "@/components/DraggablePaperList";

export default function ListsPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-stone-500">Loading...</div>}>
      <ListsPageContent />
    </Suspense>
  );
}

function ListsPageContent() {
  const searchParams = useSearchParams();
  const listId = searchParams.get("id");

  // Recover token from URL parameter (admin recovery)
  useEffect(() => {
    const token = searchParams.get("token");
    if (token && listId) {
      saveListToken(listId, token, "");
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }
  }, [listId, searchParams]);

  const startEdit = searchParams.get("edit") === "1";

  if (listId) {
    return <ListView listId={listId} startInEditMode={startEdit} />;
  }
  return (
    <div className="text-center py-20">
      <p className="text-stone-500 text-sm">No collection specified.</p>
      <Link href="/playlist" className="text-stone-600 hover:text-stone-800 underline text-sm mt-2 inline-block">
        Back to My Collections
      </Link>
    </div>
  );
}

// ─── List View (with id) ────────────────────────────────────────────────────

function ListView({ listId, startInEditMode }: { listId: string; startInEditMode?: boolean }) {
  const [data, setData] = useState<ListWithPapers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(!!startInEditMode);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [page, setPage] = useState(0);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const editMenuRef = useRef<HTMLDivElement>(null);

  const ownerToken = getTokenForList(listId);
  const isOwner = !!ownerToken;

  const loadList = useCallback(async () => {
    try {
      const result = await fetchList(listId);
      setData(result);
      setEditName(result.list.name);
      setEditDesc(result.list.description);
      if (ownerToken) {
        updateListTokenName(listId, result.list.name);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load list");
    }
    setLoading(false);
  }, [listId, ownerToken]);

  useEffect(() => { loadList(); }, [loadList]);

  // Set page title
  useEffect(() => {
    if (data) {
      document.title = `${data.list.name} — unarXiv`;
    }
    return () => { document.title = "unarXiv"; };
  }, [data?.list.name]);

  // Auto-resize description textarea
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [editDesc, editMode]);

  // Close share menu on outside click
  useEffect(() => {
    if (!showShareMenu) return;
    const handler = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showShareMenu]);

  // Close edit menu on outside click
  useEffect(() => {
    if (!showEditMenu) return;
    const handler = (e: MouseEvent) => {
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setShowEditMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEditMenu]);

  const paperMap: Record<string, Paper> = {};
  const paperIds: string[] = [];
  const notFoundIds = new Set<string>();
  if (data) {
    for (const p of data.papers) {
      if ("not_found" in p) {
        notFoundIds.add(p.id);
        paperMap[p.id] = {
          id: p.id, arxiv_url: "", title: `${p.id} [Deleted Paper - Click to Restore]`,
          authors: [], abstract: "", published_date: "", status: "not_found",
          error_message: null, progress_detail: null, audio_url: null,
          audio_size_bytes: null, duration_seconds: null, created_at: "", completed_at: null,
        };
      } else {
        paperMap[p.id] = p as Paper;
      }
    }
    for (const p of data.papers) {
      paperIds.push(p.id);
    }
  }

  const handleSave = async () => {
    if (!ownerToken || !editName.trim()) return;
    setSaving(true);
    try {
      await updateListApi(listId, ownerToken, editName.trim(), editDesc.trim());
      updateListTokenName(listId, editName.trim());
      setData((prev) => prev ? {
        ...prev,
        list: { ...prev.list, name: editName.trim(), description: editDesc.trim() },
      } : prev);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
    setSaving(false);
  };

  const handleRemove = async (paperId: string) => {
    if (!ownerToken) return;
    try {
      await removeItemFromList(listId, ownerToken, paperId);
      setData((prev) => prev ? {
        ...prev,
        papers: prev.papers.filter((p) => p.id !== paperId),
        list: { ...prev.list, paper_count: prev.list.paper_count - 1 },
      } : prev);
    } catch {}
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!ownerToken) return;
    setData((prev) => {
      if (!prev) return prev;
      const pMap = new Map(prev.papers.map((p) => [p.id, p]));
      const reordered = orderedIds.map((id) => pMap.get(id)).filter(Boolean) as typeof prev.papers;
      return { ...prev, papers: reordered };
    });
    try {
      await reorderListApi(listId, ownerToken, orderedIds);
    } catch {
      loadList();
    }
  };

  const handleImport = async (text?: string) => {
    const value = (text ?? importText).trim();
    if (!ownerToken || !value) return;
    setImporting(true);
    setImportResult(null);
    setImportText("");
    try {
      const result = await importBulk(listId, ownerToken, value);
      setImportResult(result);
      await loadList();
    } catch (e: any) {
      setImportResult({ added: [], invalid: [e.message || "Import failed"] });
    }
    setImporting(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/l?id=${listId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!ownerToken) return;
    if (!confirm("Delete this collection permanently? This cannot be undone.")) return;
    try {
      await deleteListApi(listId, ownerToken);
      removeListToken(listId);
      window.location.href = "/playlist";
    } catch {
      alert("Failed to delete collection");
    }
  };

  const handleDoneEditing = () => {
    handleSave();
    setEditMode(false);
    // Update URL without full reload
    window.history.replaceState({}, "", `/l?id=${listId}`);
  };

  if (loading) {
    return <div className="text-stone-500 text-sm py-20 text-center">Loading...</div>;
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-stone-500 text-sm">{error || "Collection not found"}</p>
        <Link href="/playlist" className="text-stone-600 hover:text-stone-800 underline text-sm mt-2 inline-block">
          Back to My Collections
        </Link>
      </div>
    );
  }

  const visiblePapers = data.papers.filter((p) => !("not_found" in p));

  // ─── Edit View (owner + edit mode) ──────────────────────────────────────────

  if (editMode) { // TODO: restore `isOwner && editMode` after testing
    return (
      <div className="space-y-4 md:space-y-6 -mx-6 md:mx-0">
        {/* Top bar: back + Public View button with share submenu */}
        <div className="px-6 md:px-0 flex items-center justify-between">
          <Link
            href="/playlist"
            className="text-sm text-stone-500 hover:text-stone-700 flex items-center gap-1 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Collections
          </Link>
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-opacity ${saving ? "text-stone-400 opacity-100" : saved ? "text-emerald-500 opacity-100" : "opacity-0"}`}>
              {saving ? "Saving..." : "Saved"}
            </span>
            <div className="relative" ref={shareMenuRef}>
              <button
                onClick={() => paperIds.length > 0 && setShowShareMenu(!showShareMenu)}
                disabled={paperIds.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${paperIds.length === 0 ? "text-stone-300 border-stone-200 cursor-not-allowed" : "text-stone-500 hover:text-stone-700 border-stone-300 hover:bg-stone-50"}`}
              >
                {/* Globe icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Public View
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showShareMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
                  <a
                    href={`/l?id=${listId}`}
                    onClick={(e) => { e.preventDefault(); handleDoneEditing(); }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    View public page
                  </a>
                  <button
                    onClick={() => handleCopyLink()}
                    className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 transition-colors w-full text-left ${copied ? "text-emerald-600" : "text-stone-700"}`}
                  >
                    {copied ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                    {copied ? "Link copied!" : "Copy share link"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Name + description fields */}
        <div className="px-6 md:px-0 space-y-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            placeholder="Collection name"
            className="w-full text-xl md:text-2xl font-bold text-stone-900 bg-transparent border-b-2 border-transparent focus:border-stone-400 outline-none pb-1 transition-colors placeholder:text-stone-300"
            maxLength={100}
          />
          <textarea
            ref={descRef}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            onBlur={handleSave}
            placeholder="Description here..."
            className="w-full text-sm text-stone-600 bg-transparent border-b border-stone-100 focus:border-stone-300 outline-none pb-1 resize-none transition-colors placeholder:text-stone-400 overflow-hidden"
            rows={1}
            maxLength={500}
          />
        </div>

        {/* Papers */}
        <section className="bg-white border-y md:border border-stone-300 md:rounded-xl overflow-hidden">
          <div className="px-4 md:px-5 py-3 md:py-4 border-b border-stone-200">
            <h2 className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Papers
            </h2>
          </div>
          {paperIds.length > 0 && (
            <DraggablePaperList
              items={paperIds}
              papers={paperMap}
              loading={false}
              onReorder={handleReorder}
              onRemove={handleRemove}
              emptyMessage=""
              emptyAction={null}
            />
          )}
          {/* Inline import form — footer of Papers section */}
          <div className="border-t border-stone-200 px-4 md:px-5 py-3 space-y-2">
            <div className="relative">
              {!importText && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-stone-400">
                  Paste arXiv (or unarXiv) URLs or IDs to add papers
                </div>
              )}
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (text.trim()) {
                    setTimeout(() => handleImport(text), 300);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleImport();
                  }
                }}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-300 resize-none bg-stone-50"
                rows={1}
                autoFocus
              />
            </div>
            {importResult && (
              <div className="text-xs space-y-1">
                {(() => {
                  const newCount = importResult.added.length - (importResult.duplicates || 0);
                  const dupCount = importResult.duplicates || 0;
                  return (
                    <>
                      {newCount > 0 && (
                        <p className="text-emerald-600">
                          Added {newCount} paper{newCount !== 1 ? "s" : ""}.
                          {dupCount > 0 && (
                            <span className="text-stone-400"> Ignored {dupCount} already in the collection.</span>
                          )}
                        </p>
                      )}
                      {newCount === 0 && dupCount > 0 && (
                        <p className="text-stone-500">
                          {dupCount === 1 ? "That paper is" : `All ${dupCount} papers are`} already in the collection.
                        </p>
                      )}
                    </>
                  );
                })()}
                {importResult.invalid.length > 0 && (
                  <p className="text-red-500">
                    We didn&apos;t recognize an arXiv ID in &ldquo;{importResult.invalid.join(", ")}&rdquo;
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Danger zone */}
        <div className="px-6 md:px-0 pt-4 border-t border-stone-100">
          <button
            onClick={handleDelete}
            className="text-xs text-stone-400 hover:text-red-500 transition-colors flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete this collection
          </button>
        </div>
      </div>
    );
  }

  // ─── Public View (default for everyone, including owner) ──────────────────

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">{data.list.name}</h1>
            {visiblePapers.length > 0 && (
              <span className="text-xs text-stone-400 whitespace-nowrap">
                {visiblePapers.length} paper{visiblePapers.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {data.list.description && (
            <p className="text-sm text-stone-500 mt-1.5 whitespace-pre-wrap leading-relaxed">{data.list.description}</p>
          )}
        </div>
        {isOwner && (
          <div className="shrink-0 relative" ref={editMenuRef}>
            <button
              onClick={() => setShowEditMenu(!showEditMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
            >
              {/* Pencil icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showEditMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-20 min-w-[160px]">
                <p className="px-3 py-1.5 text-[10px] text-stone-400 italic text-center bg-stone-50 rounded-t-lg border-b border-stone-100">Only visible to you</p>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setShowEditMenu(false);
                      window.history.replaceState({}, "", `/l?id=${listId}&edit=1`);
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors w-full text-left"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit collection
                  </button>
                  <button
                    onClick={() => handleCopyLink()}
                    className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-stone-50 transition-colors w-full text-left ${copied ? "text-emerald-600" : "text-stone-700"}`}
                  >
                    {copied ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                    {copied ? "Link copied!" : "Copy share link"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Papers */}
      {visiblePapers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-stone-400 text-sm">This collection is empty.</p>
          {isOwner && (
            <button
              onClick={() => {
                setEditMode(true);
                window.history.replaceState({}, "", `/l?id=${listId}&edit=1`);
              }}
              className="text-stone-500 hover:text-stone-700 underline text-sm mt-2"
            >
              Add papers
            </button>
          )}
        </div>
      ) : (() => {
        const perPage = 6;
        const totalPages = Math.ceil(visiblePapers.length / perPage);
        const paginated = visiblePapers.slice(page * perPage, (page + 1) * perPage);
        return (
          <>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="text-xs text-stone-400 tabular-nums">
                  {page + 1}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
            <div className="grid gap-4">
              {paginated.map((p) => (
                <PaperCard key={p.id} paper={p as Paper} />
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
