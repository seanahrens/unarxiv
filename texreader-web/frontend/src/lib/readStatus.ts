const STORAGE_KEY = "read_papers";

function getReadRecord(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Migrate legacy array format (["id1","id2"]) → object format ({"id1":"...","id2":"..."})
    if (Array.isArray(parsed)) {
      const migrated: Record<string, string> = {};
      for (const id of parsed) {
        if (typeof id === "string" && id) migrated[id] = new Date().toISOString();
      }
      saveReadRecord(migrated);
      return migrated;
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveReadRecord(record: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function isRead(paperId: string): boolean {
  return paperId in getReadRecord();
}

export function markAsRead(paperId: string): void {
  const record = getReadRecord();
  if (!(paperId in record)) {
    record[paperId] = new Date().toISOString();
    saveReadRecord(record);
  }
}

export function markAsUnread(paperId: string): void {
  const record = getReadRecord();
  delete record[paperId];
  saveReadRecord(record);
}

export function getReadDate(paperId: string): Date | null {
  const record = getReadRecord();
  const dt = record[paperId];
  return dt ? new Date(dt) : null;
}

export function getReadHistory(): { paperId: string; readAt: string }[] {
  const record = getReadRecord();
  return Object.entries(record)
    .map(([paperId, readAt]) => ({ paperId, readAt }))
    .sort((a, b) => b.readAt.localeCompare(a.readAt));
}

export function getReadPaperIds(): Set<string> {
  return new Set(Object.keys(getReadRecord()));
}
