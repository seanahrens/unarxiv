"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  getPlaylist as loadPlaylist,
  addToPlaylist as addToStorage,
  removeFromPlaylist as removeFromStorage,
  isInPlaylist as checkInPlaylist,
  reorderPlaylist as reorderStorage,
  type PlaylistEntry,
} from "@/lib/playlist";

interface PlaylistContextValue {
  playlist: PlaylistEntry[];
  playlistCount: number;
  addToPlaylist: (paperId: string, sourceRect?: DOMRect) => void;
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
  const [playlist, setPlaylist] = useState<PlaylistEntry[]>([]);
  const [animatingPaperId, setAnimatingPaperId] = useState<string | null>(null);
  const [animationSourceRect, setAnimationSourceRect] = useState<DOMRect | null>(null);
  const [removingPaperId, setRemovingPaperId] = useState<string | null>(null);
  const [removeAnimationTargetRect, setRemoveAnimationTargetRect] = useState<DOMRect | null>(null);
  const [badgePulse, setBadgePulse] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setPlaylist(loadPlaylist());
  }, []);

  const addToPlaylist = useCallback((paperId: string, sourceRect?: DOMRect) => {
    addToStorage(paperId);
    setPlaylist(loadPlaylist());
    // Trigger fly-to animation
    if (sourceRect) {
      setAnimatingPaperId(paperId);
      setAnimationSourceRect(sourceRect);
    }
    // Trigger badge pulse after animation completes (or immediately if no animation)
    setTimeout(() => {
      setBadgePulse(true);
      setTimeout(() => setBadgePulse(false), 600);
      setAnimatingPaperId(null);
      setAnimationSourceRect(null);
    }, sourceRect ? 500 : 0);
  }, []);

  const removeFromPlaylist = useCallback((paperId: string, targetRect?: DOMRect) => {
    if (targetRect) {
      setRemovingPaperId(paperId);
      setRemoveAnimationTargetRect(targetRect);
      setTimeout(() => {
        removeFromStorage(paperId);
        setPlaylist(loadPlaylist());
        setRemovingPaperId(null);
        setRemoveAnimationTargetRect(null);
      }, 500);
    } else {
      removeFromStorage(paperId);
      setPlaylist(loadPlaylist());
    }
  }, []);

  const isInPlaylistCheck = useCallback((paperId: string) => {
    return checkInPlaylist(paperId);
  }, []);

  const reorderPlaylistAction = useCallback((orderedIds: string[]) => {
    reorderStorage(orderedIds);
    setPlaylist(loadPlaylist());
  }, []);

  return (
    <PlaylistContext.Provider
      value={{
        playlist,
        playlistCount: playlist.length,
        addToPlaylist,
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
