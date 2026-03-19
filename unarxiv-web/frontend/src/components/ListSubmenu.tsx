"use client";

import { useState, useEffect, useRef } from "react";
import { getMyListTokens, addItemsToList, removeItemFromList, fetchList } from "@/lib/lists";
import type { Paper } from "@/lib/api";
import CreateCollectionModal from "./CreateCollectionModal";

interface ListSubmenuProps {
  paperId: string;
  onClose: () => void;
  /** Called before adding to a collection for arXiv-only papers that need importing first. */
  onEnsureImported?: () => Promise<Paper | null>;
}

export default function ListSubmenu({ paperId, onClose, onEnsureImported }: ListSubmenuProps) {
  const tokens = getMyListTokens();
  const entries = Object.entries(tokens);
  const [subOpen, setSubOpen] = useState(false);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const subRef = useRef<HTMLDivElement>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const [createBtnRect, setCreateBtnRect] = useState<DOMRect | null>(null);
  // Cache membership results per paperId so we don't re-fetch on every open.
  const membershipCache = useRef<{ paperId: string; result: Set<string> } | null>(null);

  // Check which lists already contain this paper when submenu opens.
  // Results are cached for the current paperId and reused on subsequent opens.
  useEffect(() => {
    if (!subOpen || entries.length === 0) return;
    // Use cached result if we already checked for this paperId.
    if (membershipCache.current?.paperId === paperId) {
      setAddedTo(new Set(membershipCache.current.result));
      return;
    }
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
      membershipCache.current = { paperId, result: inLists };
      setAddedTo(inLists);
      setChecking(false);
    };
    check();
  }, [subOpen, paperId, entries.length]);

  const handleToggle = async (listId: string) => {
    const token = tokens[listId]?.ownerToken;
    if (!token) return;
    const isAdded = addedTo.has(listId);
    try {
      if (isAdded) {
        await removeItemFromList(listId, token, paperId);
        setAddedTo((prev) => {
          const next = new Set(prev);
          next.delete(listId);
          if (membershipCache.current?.paperId === paperId) {
            membershipCache.current = { paperId, result: next };
          }
          return next;
        });
      } else {
        if (onEnsureImported) {
          const imported = await onEnsureImported();
          if (!imported) return;
        }
        await addItemsToList(listId, token, [paperId]);
        setAddedTo((prev) => {
          const next = new Set([...prev, listId]);
          if (membershipCache.current?.paperId === paperId) {
            membershipCache.current = { paperId, result: next };
          }
          return next;
        });
      }
    } catch {}
  };

  const handleCreateNew = () => {
    // Capture the button rect for fly-to animation before opening modal
    if (createBtnRef.current) {
      setCreateBtnRect(createBtnRef.current.getBoundingClientRect());
    }
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    onClose();
  };

  return (
    <>
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

            {/* Divider + Create New */}
            {entries.length > 0 && <div className="border-t border-stone-200 mx-3 my-1" />}
            <button
              ref={createBtnRef}
              onClick={handleCreateNew}
              className="w-full flex items-center gap-2 px-4 py-2 text-xs text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="font-medium">Create New</span>
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <CreateCollectionModal
          paperId={paperId}
          onClose={handleModalClose}
          sourceRect={createBtnRect}
          onEnsureImported={onEnsureImported}
        />
      )}
    </>
  );
}
