"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { MyPapersSectionSkeleton } from "@/components/Skeleton";

export default function MyCollectionsPage() {
  const router = useRouter();

  const [myLists, setMyLists] = useState<ListMeta[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [copiedListId, setCopiedListId] = useState<string | null>(null);
  const [syncCopied, setSyncCopied] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [listError, setListError] = useState("");

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

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-stone-400">
            <path d="M3 6H1v13c0 1.1.9 2 2 2h17v-2H3V6z" />
            <path d="M21 4h-7l-2-2H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" />
          </svg>
          My Collections
        </h1>
        <button
          onClick={handleCreateList}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-stone-300 text-stone-600 hover:text-stone-800 hover:border-stone-400 hover:bg-stone-50 rounded-lg transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Collection
        </button>
      </div>

      {listError && (
        <p className="text-xs text-red-600 mb-3">{listError}</p>
      )}

      {/* Collections list */}
      {listsLoading ? (
        <MyPapersSectionSkeleton rows={3} />
      ) : myLists.length === 0 ? (
        <div className="text-center py-12">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-stone-200 mx-auto mb-3">
            <path d="M3 6H1v13c0 1.1.9 2 2 2h17v-2H3V6z" />
            <path d="M21 4h-7l-2-2H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" />
          </svg>
          <p className="text-stone-500 text-sm">No collections yet.</p>
          <p className="text-stone-400 text-xs mt-1">Create one to organize your papers.</p>
        </div>
      ) : (
        <div className="border border-stone-300 rounded-xl overflow-hidden divide-y divide-stone-200">
          {myLists.map((list) => (
            <div
              key={list.id}
              className="flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3 hover:bg-stone-50 transition-colors cursor-pointer"
              onClick={() => { router.push(`/l?id=${list.id}&edit=1`); }}
            >
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

      {/* Device Sync */}
      <div className="flex justify-center mt-8">
        <button
          onClick={() => setShowSyncModal(true)}
          className="group inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full border transition-colors text-stone-400 border-stone-200 bg-surface hover:text-stone-600 hover:border-stone-300"
        >
          {/* Laptop icon on mobile */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="md:hidden">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="2" y1="20" x2="22" y2="20" />
          </svg>
          {/* Smartphone icon on desktop */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hidden md:block">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          Link Profile to Another Device
        </button>
      </div>

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowSyncModal(false); setSyncCopied(false); }}>
          <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                {/* Laptop icon on mobile */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="md:hidden">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="2" y1="20" x2="22" y2="20" />
                </svg>
                {/* Smartphone icon on desktop */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hidden md:block">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
                Link Profile to Another Device
              </h3>
              <button onClick={() => { setShowSyncModal(false); setSyncCopied(false); }} className="text-stone-400 hover:text-stone-600 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="text-sm text-stone-600 space-y-2 mb-4">
              <p>Copy a link to sync your unarXiv profile to another device &mdash; phone, tablet, laptop, or even a different browser on this computer.</p>
              <p>Open the link on your other device and your playlist, collections, ratings, and playback progress will merge and stay in sync going forward.</p>
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
