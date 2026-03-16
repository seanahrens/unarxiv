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
}

export function removeFromPlaylist(paperId: string): void {
  const entries = load().filter((e) => e.paperId !== paperId);
  save(entries);
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
}

export function getPlaylistCount(): number {
  return load().length;
}
