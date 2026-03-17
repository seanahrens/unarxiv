"use client";

import { useState, useEffect, useRef } from "react";
import { getMyListTokens, addItemsToList, removeItemFromList, fetchList } from "@/lib/lists";

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

  const handleToggle = async (listId: string) => {
    const token = tokens[listId]?.ownerToken;
    if (!token) return;
    const isAdded = addedTo.has(listId);
    try {
      if (isAdded) {
        await removeItemFromList(listId, token, paperId);
        setAddedTo((prev) => { const next = new Set(prev); next.delete(listId); return next; });
      } else {
        await addItemsToList(listId, token, [paperId]);
        setAddedTo((prev) => new Set([...prev, listId]));
      }
    } catch {}
  };

  return (
    <div
      ref={subRef}
      className="relative"
    >
      <button
        onClick={() => setSubOpen(!subOpen)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 6H1v13c0 1.1.9 2 2 2h17v-2H3V6z" />
            <path d="M21 4h-7l-2-2H7c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" />
          </svg>
          Add to Collection
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {subOpen && (
        <div className="absolute right-full top-0 bg-white border border-stone-300 rounded-xl shadow-lg z-50 min-w-[160px] py-1">
          {entries.map(([listId, entry]) => {
            const isAdded = addedTo.has(listId);
            return (
              <button
                key={listId}
                onClick={() => handleToggle(listId)}
                className={`w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-stone-100 transition-colors ${isAdded ? "text-emerald-600" : "text-stone-700"}`}
              >
                {isAdded ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span className="w-3 h-3 inline-block" />
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
