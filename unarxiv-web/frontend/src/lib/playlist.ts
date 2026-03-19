import { addToPlaylistApi, removeFromPlaylistApi, setPlaylistApi } from "./api";

const STORAGE_KEY = "playlist";

export interface PlaylistEntry {
  paperId: string;
  addedAt: string;
}

function load(): PlaylistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function save(entries: PlaylistEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getPlaylist(): PlaylistEntry[] {
  return load();
}

export function addToPlaylist(paperId: string): void {
  const entries = load();
  if (entries.some((e) => e.paperId === paperId)) return;
  entries.push({ paperId, addedAt: new Date().toISOString() });
  save(entries);
  addToPlaylistApi(paperId);
}

/** Add paper to top of playlist, or move it there if already present. */
export function addOrMoveToTop(paperId: string): void {
  const entries = load();
  const existing = entries.find((e) => e.paperId === paperId);
  const filtered = entries.filter((e) => e.paperId !== paperId);
  const entry = existing || { paperId, addedAt: new Date().toISOString() };
  save([entry, ...filtered]);
  setPlaylistApi([entry, ...filtered].map((e) => e.paperId));
}

export function removeFromPlaylist(paperId: string): void {
  const entries = load().filter((e) => e.paperId !== paperId);
  save(entries);
  removeFromPlaylistApi(paperId);
}

export function isInPlaylist(paperId: string): boolean {
  return load().some((e) => e.paperId === paperId);
}

export function reorderPlaylist(orderedIds: string[]): void {
  const entries = load();
  const map = new Map(entries.map((e) => [e.paperId, e]));
  const reordered = orderedIds
    .map((id) => map.get(id))
    .filter((e): e is PlaylistEntry => !!e);
  save(reordered);
  setPlaylistApi(orderedIds);
}

export function getPlaylistCount(): number {
  return load().length;
}

/** Merge backend playlist into localStorage (called once on init). */
export function mergeBackendPlaylist(backendEntries: { paperId: string; addedAt: string }[]): void {
  const local = load();
  const localIds = new Set(local.map((e) => e.paperId));
  const newEntries = backendEntries.filter((e) => !localIds.has(e.paperId));
  if (newEntries.length > 0) {
    save([...local, ...newEntries]);
  }
  // Push merged state to backend if local had items backend didn't
  const backendIds = new Set(backendEntries.map((e) => e.paperId));
  const localOnly = local.filter((e) => !backendIds.has(e.paperId));
  if (localOnly.length > 0) {
    const merged = [...local, ...newEntries];
    setPlaylistApi(merged.map((e) => e.paperId));
  }
}
