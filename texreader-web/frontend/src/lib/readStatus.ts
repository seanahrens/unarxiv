const STORAGE_KEY = "read_papers";

function getReadSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveReadSet(s: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}

export function isRead(paperId: string): boolean {
  return getReadSet().has(paperId);
}

export function markAsRead(paperId: string): void {
  const s = getReadSet();
  s.add(paperId);
  saveReadSet(s);
}

export function markAsUnread(paperId: string): void {
  const s = getReadSet();
  s.delete(paperId);
  saveReadSet(s);
}

export function getReadPaperIds(): Set<string> {
  return getReadSet();
}
