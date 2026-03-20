"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  getPlaylist as loadPlaylist,
  addToPlaylist as addToStorage,
  addOrMoveToTop as moveToTopStorage,
  removeFromPlaylist as removeFromStorage,
  isInPlaylist as checkInPlaylist,
  reorderPlaylist as reorderStorage,
  mergeBackendPlaylist,
  type PlaylistEntry,
} from "@/lib/playlist";
import { mergeBackendHistory } from "@/lib/readStatus";
import { getPlaylistApi, getListenHistoryApi } from "@/lib/api";
import { track } from "@/lib/analytics";

interface PlaylistContextValue {
  playlist: PlaylistEntry[];
  playlistCount: number;
  addToPlaylist: (paperId: string, sourceRect?: DOMRect) => void;
  addOrMoveToTop: (paperId: string, sourceRect?: DOMRect) => void;
  removeFromPlaylist: (paperId: string, targetRect?: DOMRect) => void;
  isInPlaylist: (paperId: string) => boolean;
  reorderPlaylist: (orderedIds: string[]) => void;
  animatingPaperId: string | null;
  animationSourceRect: DOMRect | null;
  removingPaperId: string | null;
  removeAnimationTargetRect: DOMRect | null;
  badgePulse: boolean;
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null);

export function usePlaylist() {
  const ctx = useContext(PlaylistContext);
  if (!ctx) throw new Error("usePlaylist must be used within PlaylistProvider");
  return ctx;
}

export function PlaylistProvider({ children }: { children: ReactNode }) {
  // Initialize synchronously from localStorage to avoid flash of empty playlist count
  const [playlist, setPlaylist] = useState<PlaylistEntry[]>(() => loadPlaylist());
  const [animatingPaperId, setAnimatingPaperId] = useState<string | null>(null);
  const [animationSourceRect, setAnimationSourceRect] = useState<DOMRect | null>(null);
  const [removingPaperId, setRemovingPaperId] = useState<string | null>(null);
  const [removeAnimationTargetRect, setRemoveAnimationTargetRect] = useState<DOMRect | null>(null);
  const [badgePulse, setBadgePulse] = useState(false);

  // Merge backend data on mount
  useEffect(() => {
    Promise.all([getPlaylistApi(), getListenHistoryApi()]).then(([backendPlaylist, backendHistory]) => {
      if (backendPlaylist.length > 0) {
        mergeBackendPlaylist(backendPlaylist);
        setPlaylist(loadPlaylist());
      }
      if (backendHistory.length > 0) {
        mergeBackendHistory(backendHistory);
      }
    }).catch(() => {});
  }, []);

  const triggerAddAnimation = useCallback((sourceRect?: DOMRect) => {
    if (sourceRect) {
      setAnimatingPaperId("_anim");
      setAnimationSourceRect(sourceRect);
    }
    setTimeout(() => {
      setBadgePulse(true);
      setTimeout(() => setBadgePulse(false), 600);
      setAnimatingPaperId(null);
      setAnimationSourceRect(null);
    }, sourceRect ? 500 : 0);
  }, []);

  const addToPlaylist = useCallback((paperId: string, sourceRect?: DOMRect) => {
    addToStorage(paperId);
    const updated = loadPlaylist();
    setPlaylist(updated);
    triggerAddAnimation(sourceRect);
    track("playlist_modified", { action: "add", arxiv_id: paperId, playlist_size: updated.length });
  }, [triggerAddAnimation]);

  const addOrMoveToTop = useCallback((paperId: string, sourceRect?: DOMRect) => {
    const wasInPlaylist = checkInPlaylist(paperId);
    moveToTopStorage(paperId);
    setPlaylist(loadPlaylist());
    // Only animate if it wasn't already in the playlist
    if (!wasInPlaylist) {
      triggerAddAnimation(sourceRect);
    }
  }, [triggerAddAnimation]);

  const removeFromPlaylist = useCallback((paperId: string, targetRect?: DOMRect) => {
    if (targetRect) {
      setRemovingPaperId(paperId);
      setRemoveAnimationTargetRect(targetRect);
      setTimeout(() => {
        removeFromStorage(paperId);
        const updated = loadPlaylist();
        setPlaylist(updated);
        setRemovingPaperId(null);
        setRemoveAnimationTargetRect(null);
        track("playlist_modified", { action: "remove", arxiv_id: paperId, playlist_size: updated.length });
      }, 500);
    } else {
      removeFromStorage(paperId);
      const updated = loadPlaylist();
      setPlaylist(updated);
      track("playlist_modified", { action: "remove", arxiv_id: paperId, playlist_size: updated.length });
    }
  }, []);

  const isInPlaylistCheck = useCallback((paperId: string) => {
    return checkInPlaylist(paperId);
  }, []);

  const reorderPlaylistAction = useCallback((orderedIds: string[]) => {
    reorderStorage(orderedIds);
    const updated = loadPlaylist();
    setPlaylist(updated);
    track("playlist_modified", { action: "reorder", playlist_size: updated.length });
  }, []);

  return (
    <PlaylistContext.Provider
      value={{
        playlist,
        playlistCount: playlist.length,
        addToPlaylist,
        addOrMoveToTop,
        removeFromPlaylist,
        isInPlaylist: isInPlaylistCheck,
        reorderPlaylist: reorderPlaylistAction,
        animatingPaperId,
        animationSourceRect,
        removingPaperId,
        removeAnimationTargetRect,
        badgePulse,
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
}
