"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { createListApi, saveListToken, addItemsToList } from "@/lib/lists";
import { usePlaylist } from "@/contexts/PlaylistContext";
import type { Paper } from "@/lib/api";
import { track } from "@/lib/analytics";

interface CreateCollectionModalProps {
  paperId: string;
  onClose: () => void;
  /** The DOMRect of the button that triggered the modal, used for fly-to animation. */
  sourceRect?: DOMRect | null;
  /** Called before adding to ensure arXiv-only papers are imported first. */
  onEnsureImported?: () => Promise<Paper | null>;
}

export default function CreateCollectionModal({ paperId, onClose, sourceRect, onEnsureImported }: CreateCollectionModalProps) {
  const [name, setName] = useState("");
  const [publiclyListed, setPubliclyListed] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addToPlaylist } = usePlaylist();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Cleanup tooltip timeout
  useEffect(() => {
    return () => {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    };
  }, []);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      if (onEnsureImported) {
        const imported = await onEnsureImported();
        if (!imported) { setCreating(false); return; }
      }
      const { list, owner_token } = await createListApi(trimmed, "", publiclyListed);
      saveListToken(list.id, owner_token, list.name);
      await addItemsToList(list.id, owner_token, [paperId]);
      track("collection_created", { is_public: publiclyListed, paper_count: 1 });
      onClose();
      // Delay then trigger fly-to animation
      setTimeout(() => {
        if (sourceRect) {
          addToPlaylist(paperId, sourceRect);
          // Remove immediately since we only want the animation, not to actually add to playlist
          // Actually we use the playlist fly-to just for the visual effect — the paper was added to a collection, not the playlist.
          // We'll trigger the animation directly instead.
        }
        triggerFlyToNav(sourceRect);
      }, 100);
    } catch {
      setCreating(false);
    }
  };

  const handleInfoClick = () => {
    setShowTooltip(true);
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = setTimeout(() => setShowTooltip(false), 3000);
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center"
      style={{ zIndex: 9999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-4">New Collection</h2>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder="Collection name"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 mb-4"
        />

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-700">Publicly Listed</span>
            <div className="relative">
              <button
                onClick={handleInfoClick}
                className="w-4 h-4 rounded-full border border-stone-400 text-stone-400 hover:text-stone-600 hover:border-stone-600 flex items-center justify-center text-[10px] font-bold leading-none transition-colors"
                type="button"
              >
                i
              </button>
              {showTooltip && (
                <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-stone-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-50 shadow-lg">
                  Public collections will be listed on the homepage.
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-stone-800" />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={publiclyListed}
            onClick={() => setPubliclyListed(!publiclyListed)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${publiclyListed ? "bg-emerald-500" : "bg-stone-300"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${publiclyListed ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-4 py-2 text-sm bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Trigger a fly-to animation from sourceRect to the My Papers nav button. */
function triggerFlyToNav(sourceRect?: DOMRect | null) {
  if (!sourceRect) return;

  const target = document.getElementById("player-playlist-button") || document.getElementById("playlist-nav-button");
  if (!target) return;

  const targetRect = target.getBoundingClientRect();
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;

  const dot = document.createElement("div");
  Object.assign(dot.style, {
    position: "fixed",
    left: `${startX - 8}px`,
    top: `${startY - 8}px`,
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    backgroundColor: "#44403c",
    opacity: "0.8",
    zIndex: "9999",
    pointerEvents: "none",
    transition: "none",
  });
  document.body.appendChild(dot);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      Object.assign(dot.style, {
        left: `${endX - 4}px`,
        top: `${endY - 4}px`,
        width: "8px",
        height: "8px",
        opacity: "0",
        transition: "all 450ms cubic-bezier(0.4, 0, 0.2, 1)",
      });
    });
  });

  setTimeout(() => {
    dot.remove();
  }, 500);
}
