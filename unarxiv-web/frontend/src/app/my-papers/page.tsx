"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAudio } from "@/contexts/AudioContext";
import { fetchMyAdditions, deleteMyAddition, isInProgress, type Paper } from "@/lib/api";
import { useBatchPaperPolling } from "@/hooks/usePaperPolling";
import {
  getMyListTokens,
  getTokenForList,
  removeListToken,
  saveListToken,
  createListApi,
  fetchMyLists,
  deleteListApi,
  type ListMeta,
  DEFAULT_COLLECTION_NAME,
} from "@/lib/lists";
import PaperListRow from "@/components/PaperListRow";
import NarrationProgress from "@/components/NarrationProgress";
import { MyPapersSectionSkeleton } from "@/components/Skeleton";

export default function PlaylistPage() {
  const router = useRouter();
  const { state, actions } = useAudio();
  const [myAdditions, setMyAdditions] = useState<Paper[]>([]);
  const [additionsLoading, setAdditionsLoading] = useState(true);

  // My Lists state
  const [myLists, setMyLists] = useState<ListMeta[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [syncCopied, setSyncCopied] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [additionsPage, setAdditionsPage] = useState(0);
  const ADDITIONS_PER_PAGE = 5;
  const [listError, setListError] = useState("");

  // Fetch my additions
  useEffect(() => {
    setAdditionsLoading(true);
    fetchMyAdditions()
      .then((papers) => setMyAdditions(papers))
      .catch(() => setMyAdditions([]))
      .finally(() => setAdditionsLoading(false));
  }, []);

  // Poll for in-progress additions using batch API
  const polledAdditions = useBatchPaperPolling(myAdditions);

  // Sync polled data back to state when it changes
  useEffect(() => {
    if (polledAdditions.length > 0 && polledAdditions !== myAdditions) {
      const hasChanges = polledAdditions.some((p, i) =>
        myAdditions[i] && p.status !== myAdditions[i].status
      );
      if (hasChanges) {
        setMyAdditions(polledAdditions);
      }
    }
  }, [polledAdditions, myAdditions]);

  // Fetch my lists
  const loadLists = useCallback(async () => {
    const tokens = getMyListTokens();
    const entries = Object.entries(tokens);
    if (entries.length === 0) {
      setMyLists([]);
      setListsLoading(false);
      return;
    }
    const uniqueTokens = [...new Set(entries.map(([, e]) => e.ownerToken))];
    try {
      const results = await Promise.all(uniqueTokens.map((t) => fetchMyLists(t)));
      const all = results.flat();
      const myIds = new Set(entries.map(([id]) => id));
      setMyLists(all.filter((l) => myIds.has(l.id)));
    } catch {
      setMyLists(entries.map(([id, e]) => ({
        id,
        name: e.name || "Untitled",
        description: "",
        publicly_listed: true,
        created_at: "",
        updated_at: "",
        paper_count: 0,
      })));
    }
    setListsLoading(false);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  const handleCreateList = async () => {
    setListError("");
    try {
      const { list, owner_token } = await createListApi(DEFAULT_COLLECTION_NAME, "");
      saveListToken(list.id, owner_token, list.name);
      router.push(`/l?id=${list.id}&edit=1`);
    } catch (e: any) {
      setListError(e.message || "Failed to create collection");
    }
  };

  const handleDeleteList = async (listId: string) => {
    const token = getTokenForList(listId);
    if (!token) return;
    setListError("");
    try {
      await deleteListApi(listId, token);
      removeListToken(listId);
      setMyLists((prev) => prev.filter((l) => l.id !== listId));
    } catch {
      setListError("Failed to delete collection");
    }
  };

  const handleCopyListUrl = (listId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(`${window.location.origin}/l?id=${listId}`);
    setCopiedListId(listId);
    setTimeout(() => setCopiedListId(null), 2000);
  };

  const handleCopySyncLink = () => {
    // Sync URL only needs the user token + list tokens — playlist, history,
    // and playback positions are all on the backend now
    const data: Record<string, unknown> = {};
    try {
      const token = localStorage.getItem("user_token");
      if (token) data.user_token = JSON.parse(token);
    } catch {}
    try {
      const lt = localStorage.getItem("list_tokens");
      if (lt) data.list_tokens = JSON.parse(lt);
    } catch {}
    const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
    const url = `${window.location.origin}/sync#${encoded}`;
    navigator.clipboard.writeText(url);
    setSyncCopied(true);
    setTimeout(() => setSyncCopied(false), 3000);
  };

  const additionsTotalPages = Math.ceil(myAdditions.length / ADDITIONS_PER_PAGE);
  const paginatedAdditions = myAdditions.slice(
    additionsPage * ADDITIONS_PER_PAGE,
    (additionsPage + 1) * ADDITIONS_PER_PAGE
  );

  return (
    <div className="space-y-2 md:space-y-8 -mx-6 md:mx-0">
      {/* ─── My Collections ──────────────────────────────────────── */}
      <section className="bg-white border-y md:border border-stone-300 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="text-base md:text-lg font-bold text-stone-900 flex items-center gap-2">
            {/* Material: folder_copy */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 6H1v13c0 1.1.9 2 2 2h17v-2H3V6z" />
              <path d="M21 4h-7l-2-2H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" />
            </svg>
            My Collections
          </h2>
          <button
            onClick={handleCreateList}
            className="w-8 h-8 flex items-center justify-center border border-stone-300 text-stone-500 hover:text-stone-700 hover:border-stone-400 hover:bg-stone-50 rounded-lg transition-colors"
            title="Create new collection"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {listError && (
          <p className="px-4 py-2 text-xs text-red-600 border-b border-stone-100">{listError}</p>
        )}
        {listsLoading ? (
          <MyPapersSectionSkeleton rows={2} />
        ) : myLists.length === 0 ? (
          <div className="text-stone-500 text-sm py-3 text-center">
            No collections yet. Create one with the + button above.
          </div>
        ) : (
          <div className="divide-y divide-stone-200">
            {myLists.map((list) => (
              <div
                key={list.id}
                className="flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3 hover:bg-stone-100 transition-colors cursor-pointer"
                onClick={() => { router.push(`/l?id=${list.id}&edit=1`); }}
              >
                {/* Material: folder */}
                <span className="text-stone-400 shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                </span>

                <span className="flex-1 min-w-0 text-sm truncate">
                  <span className="font-semibold text-stone-800">{list.name}</span>
                  {list.paper_count > 0 && (
                    <span className="text-stone-400 font-normal"> ({list.paper_count})</span>
                  )}
                  {list.description && (
                    <span className="text-stone-400 font-normal"> — {list.description}</span>
                  )}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Copy link button */}
                  <button
                    onClick={(e) => handleCopyListUrl(list.id, e)}
                    className={`shrink-0 transition-colors p-1 flex items-center gap-1 ${copiedListId === list.id ? "text-emerald-500" : "text-stone-400 hover:text-stone-700"}`}
                    title={copiedListId === list.id ? "Copied!" : "Copy share link"}
                  >
                    {copiedListId === list.id ? (
                      <>
                        <span className="text-xs text-emerald-500 whitespace-nowrap">Link Copied!</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    )}
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }}
                    className="text-stone-400 hover:text-stone-700 transition-colors shrink-0 p-1"
                    title="Delete collection"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── My Additions ────────────────────────────────────────── */}
      <section className="bg-white border-y md:border border-stone-300 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-stone-200">
          <h2 className="text-base md:text-lg font-bold text-stone-900 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Papers I Added
            {!additionsLoading && myAdditions.length > 0 && (
              <span className="text-stone-400 font-normal text-sm">({myAdditions.length})</span>
            )}
          </h2>
        </div>

        {additionsLoading ? (
          <MyPapersSectionSkeleton rows={2} />
        ) : myAdditions.length === 0 ? (
          <div className="text-stone-500 text-sm py-3 text-center">
            Papers you add to unarXiv will appear here.
          </div>
        ) : (
          <>
            <div className="divide-y divide-stone-200">
              {paginatedAdditions.map((paper) => {
                const paperInProgress = isInProgress(paper.status);
                return (
                  <PaperListRow
                    key={paper.id}
                    paper={paper}
                    paperId={paper.id}
                    isActive={state.paperId === paper.id}
                    extra={
                      <>
                        {paperInProgress && (
                          <div className="mt-1">
                            <NarrationProgress paper={paper} />
                          </div>
                        )}
                        {paper.status === "failed" && (
                          <span className="text-2xs text-red-500 block mt-1">
                            Failed{paper.error_message ? `: ${paper.error_message}` : ""}
                          </span>
                        )}
                      </>
                    }
                    actions={
                      <button
                        onClick={async () => {
                          const ok = await deleteMyAddition(paper.id);
                          if (ok) {
                            if (state.paperId === paper.id) actions.stop();
                            setMyAdditions((prev) => prev.filter((p) => p.id !== paper.id));
                            if (paginatedAdditions.length === 1 && additionsPage > 0) {
                              setAdditionsPage((p) => p - 1);
                            }
                          }
                        }}
                        className="text-stone-400 hover:text-stone-700 transition-colors shrink-0"
                        title="Remove from site"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    }
                  />
                );
              })}
            </div>
            {additionsTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-stone-200">
                <button
                  onClick={() => setAdditionsPage((p) => Math.max(0, p - 1))}
                  disabled={additionsPage === 0}
                  className="text-sm text-stone-500 hover:text-stone-700 disabled:text-stone-300 disabled:cursor-not-allowed transition-colors px-2 py-1"
                >
                  &larr; Prev
                </button>
                <span className="text-xs text-stone-400 tabular-nums">
                  {additionsPage + 1} / {additionsTotalPages}
                </span>
                <button
                  onClick={() => setAdditionsPage((p) => Math.min(additionsTotalPages - 1, p + 1))}
                  disabled={additionsPage >= additionsTotalPages - 1}
                  className="text-sm text-stone-500 hover:text-stone-700 disabled:text-stone-300 disabled:cursor-not-allowed transition-colors px-2 py-1"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ─── Device Sync ────────────────────────────────────────── */}
      <section className="flex justify-center px-4 md:px-0">
        <button
          onClick={() => setShowSyncModal(true)}
          className="group inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full border transition-colors text-stone-400 border-stone-200 bg-white hover:text-stone-600 hover:border-stone-300"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          Sync to another device
        </button>
      </section>

      {/* ─── Sync Modal ───────────────────────────────────────────── */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowSyncModal(false); setSyncCopied(false); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Sync to Another Device
              </h3>
              <button onClick={() => { setShowSyncModal(false); setSyncCopied(false); }} className="text-stone-400 hover:text-stone-600 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="text-sm text-stone-600 space-y-2 mb-4">
              <p>This copies a link that permanently connects your other device to this account. Open it on your phone, tablet, or another computer.</p>
              <p>Your playlist, collections, ratings, and playback progress will stay in sync across both devices going forward.</p>
            </div>
            <button
              onClick={() => { handleCopySyncLink(); }}
              className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                syncCopied
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-stone-900 text-white hover:bg-stone-800"
              }`}
            >
              {syncCopied ? "Link copied! Open it on your other device." : "Copy Sync Link"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
