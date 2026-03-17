"use client";

import { useState, useEffect, useRef } from "react";
import { getMyListTokens, addItemsToList, fetchList } from "@/lib/lists";

interface ListSubmenuProps {
  paperId: string;
  onClose: () => void;
}

export default function ListSubmenu({ paperId, onClose }: ListSubmenuProps) {
  const tokens = getMyListTokens();
  const entries = Object.entries(tokens);
  const [subOpen, setSubOpen] = useState(false);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const subRef = useRef<HTMLDivElement>(null);

  // Check which lists already contain this paper when submenu opens
  useEffect(() => {
    if (!subOpen || entries.length === 0) return;
    setChecking(true);
    const check = async () => {
      const inLists = new Set<string>();
      await Promise.all(
        entries.map(async ([listId]) => {
          try {
            const data = await fetchList(listId);
            if (data.papers.some((p) => p.id === paperId)) {
              inLists.add(listId);
            }
          } catch {}
        })
      );
      setAddedTo(inLists);
      setChecking(false);
    };
    check();
  }, [subOpen, paperId, entries.length]);

  if (entries.length === 0) return null;

  const handleAdd = async (listId: string) => {
    const token = tokens[listId]?.ownerToken;
    if (!token) return;
    try {
      await addItemsToList(listId, token, [paperId]);
      setAddedTo((prev) => new Set([...prev, listId]));
    } catch {}
  };

  return (
    <div
      ref={subRef}
      className="relative"
      onMouseEnter={() => setSubOpen(true)}
      onMouseLeave={() => setSubOpen(false)}
    >
      <button
        onClick={() => setSubOpen(!subOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Add to List
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {subOpen && (
        <div className="absolute right-full top-0 mr-1 bg-white border border-stone-300 rounded-xl shadow-lg z-50 min-w-[160px] py-1">
          {entries.map(([listId, entry]) => {
            const isAdded = addedTo.has(listId);
            return (
              <button
                key={listId}
                onClick={() => {
                  if (!isAdded) handleAdd(listId);
                  onClose();
                }}
                disabled={isAdded}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs text-stone-700 hover:bg-stone-100 transition-colors disabled:opacity-50"
              >
                {isAdded ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
                <span className="truncate">{entry.name || "Untitled"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
