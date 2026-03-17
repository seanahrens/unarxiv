"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePlaylist } from "@/contexts/PlaylistContext";
import { useAudio } from "@/contexts/AudioContext";
import { getReadHistory, markAsUnread } from "@/lib/readStatus";
import { fetchPapersBatch, fetchMyAdditions, fetchPaper, deleteMyAddition, audioUrl, type Paper } from "@/lib/api";
import {
  getMyListTokens,
  getTokenForList,
  removeListToken,
  saveListToken,
  createListApi,
  fetchMyLists,
  deleteListApi,
  type ListMeta,
} from "@/lib/lists";
import AudioFileIcon from "@/components/AudioFileIcon";
import FileIcon from "@/components/FileIcon";
import ProcessingFileIcon from "@/components/ProcessingFileIcon";
import DraggablePaperList from "@/components/DraggablePaperList";
import NarrationProgress, { POLL_INTERVAL_MS } from "@/components/NarrationProgress";

export default function PlaylistPage() {
  const { playlist, removeFromPlaylist, reorderPlaylist } = usePlaylist();
  const { state, actions } = useAudio();
  const [papers, setPapers] = useState<Record<string, Paper>>({});
  const [historyPapers, setHistoryPapers] = useState<Record<string, Paper>>({});
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [readHistory, setReadHistory] = useState<{ paperId: string; readAt: string }[]>([]);
  const [myAdditions, setMyAdditions] = useState<Paper[]>([]);
  const [additionsLoading, setAdditionsLoading] = useState(true);

  // My Lists state
  const [myLists, setMyLists] = useState<ListMeta[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [copiedListId, setCopiedListId] = useState<string | null>(null);

  // Fetch playlist papers
  useEffect(() => {
    const ids = playlist.map((e) => e.paperId);
    if (ids.length === 0) {
      setPapers({});
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPapersBatch(ids)
      .then((fetched) => {
        const map: Record<string, Paper> = {};
        fetched.forEach((p) => (map[p.id] = p));
        setPapers(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playlist]);

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
    const inProgress = myAdditions.filter((p) =>
      ["queued", "preparing", "generating_audio"].includes(p.status)
    );
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

  const handlePlay = (paper: Paper) => {
    if (state.paperId === paper.id) {
      actions.togglePlay();
    } else {
      actions.loadPaper(paper.id, paper.title, audioUrl(paper.id));
    }
  };

  const handleCreateList = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const { list, owner_token } = await createListApi(createName.trim(), createDesc.trim());
      saveListToken(list.id, owner_token, list.name);
      setCreateName("");
      setCreateDesc("");
      setShowCreateModal(false);
      setMyLists((prev) => [list, ...prev]);
    } catch (e: any) {
      setCreateError(e.message || "Failed to create list");
    }
    setCreating(false);
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm("Delete this list? This cannot be undone.")) return;
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
      {/* ─── My Playlist ─────────────────────────────────────────── */}
      <section className="bg-white border-y md:border border-stone-300 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-stone-200 flex items-center justify-between">
          <h1 className="text-base md:text-lg font-bold text-stone-900 flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="10" width="11" height="2" />
              <rect x="3" y="6" width="11" height="2" />
              <rect x="3" y="14" width="7" height="2" />
              <polygon points="16,13 16,21 22,17" />
            </svg>
            My Playlist
          </h1>
        </div>

        {playlist.length === 0 && !loading ? (
          <div className="text-stone-500 text-sm py-3 text-center">
            Your playlist is empty.
          </div>
        ) : (
          <DraggablePaperList
            items={playlist.map((e) => e.paperId)}
            papers={papers}
            loading={loading}
            onReorder={reorderPlaylist}
            onRemove={removeFromPlaylist}
            emptyMessage="Your playlist is empty."
            emptyAction={
              <Link href="/" className="text-stone-600 hover:text-stone-800 underline text-sm">
                Add papers from the home page
              </Link>
            }
          />
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
              const isActive = state.paperId === paper.id;
              const isInProgress = ["queued", "preparing", "generating_audio"].includes(paper.status);

              return (
                <div
                  key={paper.id}
                  className={`px-4 md:px-5 py-3 transition-colors ${isActive ? "bg-blue-100" : "hover:bg-stone-100"}`}
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <Link
                      href={`/p?id=${paper.id}`}
                      className={`w-7 h-7 flex items-center justify-center transition-colors shrink-0 ${
                        paper.status === "complete" ? "text-stone-500 hover:text-stone-700" :
                        isInProgress ? "text-purple-300" :
                        "text-stone-400"
                      }`}
                      title="View paper"
                    >
                      {paper.status === "complete" ? <AudioFileIcon size={28} /> : isInProgress ? <ProcessingFileIcon size={28} /> : <FileIcon size={28} />}
                    </Link>

                    {paper.status === "complete" ? (
                      <button
                        onClick={() => handlePlay(paper)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <span className="text-sm text-stone-800 line-clamp-2 md:truncate block">
                          {paper.title}
                        </span>
                        {paper.authors && paper.authors.length > 0 && (
                          <span className="text-[11px] text-stone-500 truncate block">
                            <span className="md:hidden">
                              {paper.authors[0]}
                              {paper.authors.length > 1 && ` +${paper.authors.length - 1}`}
                            </span>
                            <span className="hidden md:inline">
                              {paper.authors.slice(0, 3).join(", ")}
                              {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                            </span>
                          </span>
                        )}
                      </button>
                    ) : (
                      <Link
                        href={`/p?id=${paper.id}`}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="text-sm text-stone-800 line-clamp-2 md:truncate block">
                          {paper.title}
                        </span>
                        {paper.authors && paper.authors.length > 0 && (
                          <span className="text-[11px] text-stone-500 truncate block">
                            <span className="md:hidden">
                              {paper.authors[0]}
                              {paper.authors.length > 1 && ` +${paper.authors.length - 1}`}
                            </span>
                            <span className="hidden md:inline">
                              {paper.authors.slice(0, 3).join(", ")}
                              {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                            </span>
                          </span>
                        )}
                        {isInProgress && (
                          <div className="mt-1">
                            <NarrationProgress paper={paper} />
                          </div>
                        )}
                        {paper.status === "failed" && (
                          <span className="text-[11px] text-red-500 block mt-1">
                            Failed{paper.error_message ? `: ${paper.error_message}` : ""}
                          </span>
                        )}
                      </Link>
                    )}

                    <button
                      onClick={async () => {
                        if (!confirm("Remove this paper from unarXiv?")) return;
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
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </section>

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
            onClick={() => setShowCreateModal(true)}
            className="w-8 h-8 flex items-center justify-center border border-stone-300 text-stone-500 hover:text-stone-700 hover:border-stone-400 hover:bg-stone-50 rounded-lg transition-colors"
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
                className="flex items-center gap-2 md:gap-3 px-4 md:px-5 py-3 hover:bg-stone-100 transition-colors cursor-pointer"
                onClick={() => { window.location.href = `/l?id=${list.id}&edit=1`; }}
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
                    className={`shrink-0 transition-colors p-1 ${copiedListId === list.id ? "text-emerald-500" : "text-stone-400 hover:text-stone-700"}`}
                    title={copiedListId === list.id ? "Copied!" : "Copy share link"}
                  >
                    {copiedListId === list.id ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
        <section className="bg-white border-y md:border border-stone-300 md:rounded-xl overflow-hidden">
        <div className="px-4 md:px-5 py-3 md:py-4 border-b border-stone-200">
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
              const isActive = state.paperId === entry.paperId;
              return (
                <div
                  key={entry.paperId}
                  className={`flex items-center gap-2 md:gap-3 px-3 md:px-5 py-3 transition-colors ${isActive ? "bg-blue-100" : "hover:bg-stone-100"}`}
                >
                  <Link
                    href={`/p?id=${entry.paperId}`}
                    className={`w-7 h-7 flex items-center justify-center transition-colors shrink-0 ${
                      paper?.status === "complete" ? "text-stone-500 hover:text-stone-700" :
                      ["queued", "preparing", "generating_audio"].includes(paper?.status || "") ? "text-purple-300" :
                      "text-stone-400"
                    }`}
                    title="View paper"
                  >
                    {paper?.status === "complete" ? <AudioFileIcon size={28} /> : ["queued", "preparing", "generating_audio"].includes(paper?.status || "") ? <ProcessingFileIcon size={28} /> : <FileIcon size={28} />}
                  </Link>

                  {paper?.status === "complete" ? (
                    <button
                      onClick={() => handlePlay(paper)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <span className="text-sm text-stone-800 line-clamp-2 md:truncate block">
                        {paper?.title || (historyLoading ? "" : entry.paperId)}
                      </span>
                      {paper?.authors && paper.authors.length > 0 && (
                        <span className="text-[11px] text-stone-500 truncate block">
                          <span className="md:hidden">
                            {paper.authors[0]}
                            {paper.authors.length > 1 && ` +${paper.authors.length - 1}`}
                          </span>
                          <span className="hidden md:inline">
                            {paper.authors.slice(0, 3).join(", ")}
                            {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                          </span>
                        </span>
                      )}
                    </button>
                  ) : (
                    <Link
                      href={`/p?id=${entry.paperId}`}
                      className="flex-1 min-w-0 text-left"
                    >
                      <span className="text-sm text-stone-800 line-clamp-2 md:truncate block">
                        {paper?.title || (historyLoading ? "" : entry.paperId)}
                      </span>
                      {paper?.authors && paper.authors.length > 0 && (
                        <span className="text-[11px] text-stone-500 truncate block">
                          <span className="md:hidden">
                            {paper.authors[0]}
                            {paper.authors.length > 1 && ` +${paper.authors.length - 1}`}
                          </span>
                          <span className="hidden md:inline">
                            {paper.authors.slice(0, 3).join(", ")}
                            {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                          </span>
                        </span>
                      )}
                    </Link>
                  )}

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
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* ─── Create List Modal ───────────────────────────────────── */}
      {showCreateModal && (
        <div
          className="!m-0 fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-stone-900">Create a Collection</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="List name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                maxLength={100}
                autoFocus
              />
              <textarea
                placeholder="Description (optional)"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none"
                rows={3}
                maxLength={500}
              />
            </div>
            {createError && <p className="text-red-500 text-xs">{createError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateList}
                disabled={!createName.trim() || creating}
                className="px-4 py-2 bg-stone-900 text-white text-sm rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
