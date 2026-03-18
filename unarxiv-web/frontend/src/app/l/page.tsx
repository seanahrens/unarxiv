"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useSearchParams, useRouter } from "next/navigation";
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
  DEFAULT_COLLECTION_NAME,
} from "@/lib/lists";
import { type Paper } from "@/lib/api";
import PaperCard from "@/components/PaperCard";
import DraggablePaperList from "@/components/DraggablePaperList";
import Paginator from "@/components/Paginator";

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
      <p className="text-[#444] text-sm font-[family-name:var(--font-mono-brand)]">No collection specified.</p>
      <Link href="/my-papers" className="inline-flex items-center gap-1 text-sm font-bold uppercase tracking-widest font-[family-name:var(--font-mono-brand)] text-black hover:text-[#d32f2f] transition-colors mt-2 border-2 border-black px-3 py-1 no-underline">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="2,12 22,2 22,22" /></svg>
        Back to My Lists
      </Link>
    </div>
  );
}

// ─── List View (with id) ────────────────────────────────────────────────────

function ListView({ listId, startInEditMode }: { listId: string; startInEditMode?: boolean }) {
  const router = useRouter();
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
  const nameInputRef = useRef<HTMLInputElement>(null);
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

  // Auto-select title for new collections (only on first load)
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (data && !didAutoSelect.current && startInEditMode && editName === DEFAULT_COLLECTION_NAME && nameInputRef.current) {
      didAutoSelect.current = true;
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set page title
  useEffect(() => {
    if (data) {
      document.title = `${data.list.name} — unarXiv Collections`;
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

  useClickOutside(shareMenuRef, () => setShowShareMenu(false), showShareMenu);
  useClickOutside(editMenuRef, () => setShowEditMenu(false), showEditMenu);

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
    } catch (e: unknown) {
      console.error("Failed to save collection:", e);
    }
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
      setImportResult({ added: [], invalid: [e.message || "Import failed"], duplicates: 0 });
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
    try {
      await deleteListApi(listId, ownerToken);
      removeListToken(listId);
      router.push("/my-papers");
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
    return <div className="text-[#444] text-sm py-20 text-center font-[family-name:var(--font-mono-brand)] uppercase tracking-widest">Loading...</div>;
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-[#444] text-sm font-[family-name:var(--font-mono-brand)]">{error || "Collection not found"}</p>
        <Link href="/my-papers" className="inline-flex items-center gap-1 text-sm font-bold uppercase tracking-widest font-[family-name:var(--font-mono-brand)] text-black hover:text-[#d32f2f] transition-colors mt-2 border-2 border-black px-3 py-1 no-underline">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="2,12 22,2 22,22" /></svg>
          Back to My Lists
        </Link>
      </div>
    );
  }

  const visiblePapers = data.papers.filter((p) => !("not_found" in p));

  // ─── Edit View (owner + edit mode) ──────────────────────────────────────────

  if (isOwner && editMode) {
    return (
      <div className="space-y-4 -mx-6 md:mx-0">
        {/* Top bar: back + Public View button with share submenu */}
        <div className="px-6 md:px-0 flex items-center justify-between">
          <button
            onClick={async () => {
              // Auto-delete empty untitled collections
              if (
                ownerToken &&
                editName.trim() === DEFAULT_COLLECTION_NAME &&
                !editDesc.trim() &&
                data.papers.length === 0
              ) {
                try {
                  await deleteListApi(listId, ownerToken);
                  removeListToken(listId);
                } catch {}
              }
              router.push("/my-papers");
            }}
            className="inline-flex items-center gap-1 text-sm font-bold uppercase tracking-widest font-[family-name:var(--font-mono-brand)] text-black hover:text-[#d32f2f] transition-colors border-2 border-black px-3 py-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="2,12 22,2 22,22" /></svg>
            Back to My Lists
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-[family-name:var(--font-mono-brand)] uppercase transition-opacity ${saving ? "text-[#444] opacity-100" : saved ? "text-[#d32f2f] opacity-100" : "opacity-0"}`}>
              {saving ? "Saving..." : "Saved"}
            </span>
            <div className="relative" ref={shareMenuRef}>
              <button
                onClick={() => paperIds.length > 0 && setShowShareMenu(!showShareMenu)}
                disabled={paperIds.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-widest font-[family-name:var(--font-mono-brand)] border-2 transition-colors ${paperIds.length === 0 ? "text-[#ccc] border-[#ccc] cursor-not-allowed" : "text-black border-black hover:bg-black hover:text-white"}`}
              >
                {/* Globe icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                View Public Page
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showShareMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border-2 border-black shadow-[4px_4px_0_#000] z-20 py-1 min-w-[160px]">
                  <a
                    href={`/l?id=${listId}`}
                    onClick={(e) => { e.preventDefault(); handleDoneEditing(); }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-black hover:bg-[#f5f5f5] transition-colors font-[family-name:var(--font-mono-brand)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    View Public Page
                  </a>
                  <button
                    onClick={() => handleCopyLink()}
                    className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5f5f5] transition-colors w-full text-left font-[family-name:var(--font-mono-brand)] ${copied ? "text-[#d32f2f]" : "text-black"}`}
                  >
                    {copied ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
            ref={nameInputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                descRef.current?.focus();
              }
            }}
            placeholder="Collection Name"
            className="w-full text-xl md:text-2xl font-bold text-black bg-transparent outline-none border-b-2 border-black pb-1 transition-colors placeholder:text-[#ccc] font-[family-name:var(--font-mono-brand)] uppercase tracking-tight"
            maxLength={100}
          />
          <textarea
            ref={descRef}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            onBlur={handleSave}
            placeholder="Description"
            className="w-full text-sm text-[#444] bg-transparent outline-none pb-1 resize-none transition-colors placeholder:text-[#aaa] overflow-hidden font-[family-name:var(--font-mono-brand)]"
            rows={1}
            maxLength={500}
          />
        </div>

        {/* Papers */}
        <section className="bg-white border-y-2 md:border-2 border-black overflow-hidden">
          <div className="px-4 md:px-5 py-3 md:py-4 border-b-2 border-black bg-black">
            <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 uppercase tracking-widest font-[family-name:var(--font-mono-brand)]">
              <svg width="20" height="20" viewBox="0 0 384 512" fill="currentColor">
                <path d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM192 272V464c0 8.8-7.2 16-16 16s-16-7.2-16-16V352l-28.3 18.9c-7.3 4.9-17.2 2.9-22.1-4.4s-2.9-17.2 4.4-22.1l48-32c4.8-3.2 10.9-3.8 16.2-1.7s9.8 7.4 9.8 13.1V272c0 8.8-7.2 16-16 16s-16-7.2-16-16zm96 0v38.1c0 19-8.4 37-23 49.2l-32.6 27.2c-6.8 5.6-7.7 15.6-2.1 22.4s15.6 7.7 22.4 2.1l4.3-3.6V464c0 8.8 7.2 16 16 16s16-7.2 16-16V272c0-8.8-7.2-16-16-16s-16 7.2-16 16z" />
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
              placeholder="Paste arXiv (or unarXiv) URLs or IDs to add papers"
              className="w-full px-3 py-2 text-sm focus:outline-none resize-none border-2 border-black bg-white font-[family-name:var(--font-mono-brand)] focus:border-[#d32f2f]"
              rows={1}
            />
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

      </div>
    );
  }

  // ─── Public View (default for everyone, including owner) ──────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-black uppercase tracking-tight font-[family-name:var(--font-mono-brand)] border-b-2 border-black pb-2">{data.list.name}</h1>
          {data.list.description && (
            <p className="text-sm text-[#444] mt-1.5 whitespace-pre-wrap leading-relaxed font-[family-name:var(--font-mono-brand)]">{data.list.description}</p>
          )}
        </div>
        {isOwner && (
          <div className="shrink-0 relative" ref={editMenuRef}>
            <button
              onClick={() => setShowEditMenu(!showEditMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-widest font-[family-name:var(--font-mono-brand)] text-black border-2 border-black hover:bg-black hover:text-white transition-colors"
            >
              {/* Pencil icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit Collection
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showEditMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border-2 border-black shadow-[4px_4px_0_#000] z-20 min-w-[160px]">
                <p className="px-3 py-1.5 text-3xs text-[#444] italic text-center bg-[#f5f5f5] border-b border-black font-[family-name:var(--font-mono-brand)]">Only visible to you</p>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setShowEditMenu(false);
                      window.history.replaceState({}, "", `/l?id=${listId}&edit=1`);
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-black hover:bg-[#f5f5f5] transition-colors w-full text-left font-[family-name:var(--font-mono-brand)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit Collection
                  </button>
                  <button
                    onClick={() => handleCopyLink()}
                    className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5f5f5] transition-colors w-full text-left font-[family-name:var(--font-mono-brand)] ${copied ? "text-[#d32f2f]" : "text-black"}`}
                  >
                    {copied ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
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
        <div className="text-center py-8">
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
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-black uppercase tracking-widest font-[family-name:var(--font-mono-brand)]">
                A Collection of {visiblePapers.length} Paper{visiblePapers.length !== 1 ? "s" : ""}
              </h2>
              <Paginator page={page} totalPages={totalPages} onChange={setPage} />
            </div>
            <div className="grid gap-3">
              {paginated.map((p) => (
                <PaperCard key={p.id} paper={p as Paper} />
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
