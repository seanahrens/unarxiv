"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAudio } from "@/contexts/AudioContext";
import { getReadHistory, markAsUnread } from "@/lib/readStatus";
import { fetchPapersBatch, fetchMyAdditions, fetchPaper, deleteMyAddition, isInProgress, type Paper } from "@/lib/api";
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
import NarrationProgress, { POLL_INTERVAL_MS } from "@/components/NarrationProgress";

export default function PlaylistPage() {
  const router = useRouter();
  const { state, actions } = useAudio();
  const [historyPapers, setHistoryPapers] = useState<Record<string, Paper>>({});
  const [historyLoading, setHistoryLoading] = useState(true);

  const [readHistory, setReadHistory] = useState<{ paperId: string; readAt: string }[]>([]);
  const [myAdditions, setMyAdditions] = useState<Paper[]>([]);
  const [additionsLoading, setAdditionsLoading] = useState(true);

  // My Lists state
  const [myLists, setMyLists] = useState<ListMeta[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [copiedListId, setCopiedListId] = useState<string | null>(null);

  // Fetch history papers
  useEffect(() => {
    const history = getReadHistory();
    setReadHistory(history);
    const ids = history.map((e) => e.paperId);
    if (ids.length === 0) {
      setHistoryPapers({});
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    fetchPapersBatch(ids)
      .then((fetched) => {
        const map: Record<string, Paper> = {};
        fetched.forEach((p) => (map[p.id] = p));
        setHistoryPapers(map);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  // Fetch my additions
  useEffect(() => {
    setAdditionsLoading(true);
    fetchMyAdditions()
      .then((papers) => setMyAdditions(papers))
      .catch(() => setMyAdditions([]))
      .finally(() => setAdditionsLoading(false));
  }, []);

  // Poll for in-progress additions
  useEffect(() => {
    const inProgress = myAdditions.filter((p) => isInProgress(p.status));
    if (inProgress.length === 0) return;

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        inProgress.map((p) => fetchPaper(p.id).catch(() => p))
      );
      setMyAdditions((prev) =>
        prev.map((p) => {
          const updated = updates.find((u) => u.id === p.id);
          return updated || p;
        })
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [myAdditions]);

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
        created_at: "",
        updated_at: "",
        paper_count: 0,
      })));
    }
    setListsLoading(false);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  const handleCreateList = async () => {
    try {
      const { list, owner_token } = await createListApi(DEFAULT_COLLECTION_NAME, "");
      saveListToken(list.id, owner_token, list.name);
      router.push(`/l?id=${list.id}&edit=1`);
    } catch (e: any) {
      alert(e.message || "Failed to create collection");
    }
  };

  const handleDeleteList = async (listId: string) => {
    const token = getTokenForList(listId);
    if (!token) return;
    try {
      await deleteListApi(listId, token);
      removeListToken(listId);
      setMyLists((prev) => prev.filter((l) => l.id !== listId));
    } catch {
      alert("Failed to delete list");
    }
  };

  const handleCopyListUrl = (listId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(`${window.location.origin}/l?id=${listId}`);
    setCopiedListId(listId);
    setTimeout(() => setCopiedListId(null), 2000);
  };

  return (
    <div className="space-y-2 md:space-y-8 -mx-6 md:mx-0">
      {/* ─── My Additions ────────────────────────────────────────── */}
      <section className="bg-white border-y md:border border-amber-200 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-amber-200">
          <h2 className="text-base md:text-lg font-bold text-stone-900 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Papers I Added
          </h2>
        </div>

        {additionsLoading ? (
          <div className="text-stone-500 text-sm py-3 text-center">Loading...</div>
        ) : myAdditions.length === 0 ? (
          <div className="text-stone-500 text-sm py-3 text-center">
            Papers you add to unarXiv will appear here.
          </div>
        ) : (
          <div className="divide-y divide-stone-200">
            {myAdditions.map((paper) => {
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
        )}
      </section>

      {/* ─── My Collections ──────────────────────────────────────── */}
      <section className="bg-white border-y md:border border-amber-200 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-amber-200 flex items-center justify-between">
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
            className="w-8 h-8 flex items-center justify-center border border-amber-200 text-stone-500 hover:text-stone-700 hover:border-stone-400 hover:bg-stone-50 rounded-lg transition-colors"
            title="Create new collection"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {listsLoading ? (
          <div className="text-stone-500 text-sm py-3 text-center">Loading...</div>
        ) : myLists.length === 0 ? (
          <div className="text-stone-500 text-sm py-3 text-center">
            No collections yet. Create one with the + button above.
          </div>
        ) : (
          <div className="divide-y divide-stone-200">
            {myLists.map((list) => (
              <div
                key={list.id}
                className="flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3 hover:bg-amber-50 transition-colors cursor-pointer"
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

      {/* ─── Listen History (last section) ───────────────────────── */}
      {(historyLoading || readHistory.length > 0) && (
        <section className="bg-white border-y md:border border-amber-200 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-amber-200">
          <h2 className="text-base md:text-lg font-bold text-stone-900 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
            </svg>
            Listen History
          </h2>
        </div>

        {historyLoading ? (
          <div className="text-stone-500 text-sm py-3 text-center">Loading...</div>
        ) : readHistory.length === 0 ? (
          <div className="text-stone-500 text-sm py-3 text-center">No completed listens yet.</div>
        ) : (
          <div className="divide-y divide-stone-200">
            {readHistory.map((entry) => {
              const paper = historyPapers[entry.paperId];
              if (!paper) return null;
              return (
                <PaperListRow
                  key={entry.paperId}
                  paper={paper}
                  paperId={entry.paperId}
                  isActive={state.paperId === entry.paperId}
                  actions={
                    <button
                      onClick={() => {
                        markAsUnread(entry.paperId);
                        setReadHistory((prev) => prev.filter((h) => h.paperId !== entry.paperId));
                      }}
                      className="text-stone-400 hover:text-stone-700 transition-colors shrink-0"
                      title="Mark as unread"
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
        )}
      </section>
      )}

    </div>
  );
}
