import type { Paper } from "./api";
import { API_BASE } from "./api";
const STORAGE_KEY = "list_tokens";

export const DEFAULT_COLLECTION_NAME = "Untitled Collection";

// --- localStorage token management ---

export interface ListTokenEntry {
  ownerToken: string;
  name: string;
}

export interface ListTokenStore {
  [listId: string]: ListTokenEntry;
}

function loadTokens(): ListTokenStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveTokens(store: ListTokenStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getMyListTokens(): ListTokenStore {
  return loadTokens();
}

export function saveListToken(listId: string, ownerToken: string, name: string): void {
  const store = loadTokens();
  store[listId] = { ownerToken, name };
  saveTokens(store);
}

export function removeListToken(listId: string): void {
  const store = loadTokens();
  delete store[listId];
  saveTokens(store);
}

export function getTokenForList(listId: string): string | null {
  const store = loadTokens();
  return store[listId]?.ownerToken || null;
}

export function updateListTokenName(listId: string, name: string): void {
  const store = loadTokens();
  if (store[listId]) {
    store[listId].name = name;
    saveTokens(store);
  }
}

/** Get the first stored owner token (used for X-List-Token header in my-lists queries). */
export function getFirstOwnerToken(): string | null {
  const store = loadTokens();
  const entries = Object.values(store);
  if (entries.length === 0) return null;
  return entries[0].ownerToken;
}

// --- API client ---

export interface ListMeta {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  paper_count: number;
}

export interface ListWithPapers {
  list: ListMeta;
  papers: (Paper | { id: string; not_found: true })[];
}

export interface ImportResult {
  added: Paper[];
  duplicates: number;
  invalid: string[];
}

function tokenHeaders(token: string): Record<string, string> {
  return { "Content-Type": "application/json", "X-List-Token": token };
}

export async function createListApi(name: string, description: string = ""): Promise<{ list: ListMeta; owner_token: string }> {
  const res = await fetch(`${API_BASE}/api/lists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function fetchList(id: string): Promise<ListWithPapers> {
  const res = await fetch(`${API_BASE}/api/lists/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("List not found");
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export async function fetchMyLists(token: string): Promise<ListMeta[]> {
  const res = await fetch(`${API_BASE}/api/my-lists`, {
    headers: { "X-List-Token": token },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.lists;
}

export async function updateListApi(id: string, token: string, name: string, description: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/lists/${id}`, {
    method: "PUT",
    headers: tokenHeaders(token),
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error("Failed to update list");
}

export async function deleteListApi(id: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/lists/${id}`, {
    method: "DELETE",
    headers: { "X-List-Token": token },
  });
  if (!res.ok) throw new Error("Failed to delete list");
}

export async function addItemsToList(id: string, token: string, paperIds: string[]): Promise<number> {
  const res = await fetch(`${API_BASE}/api/lists/${id}/items`, {
    method: "POST",
    headers: tokenHeaders(token),
    body: JSON.stringify({ paper_ids: paperIds }),
  });
  if (!res.ok) throw new Error("Failed to add items");
  const data = await res.json();
  return data.added;
}

export async function removeItemFromList(id: string, token: string, paperId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/lists/${id}/items/${paperId}`, {
    method: "DELETE",
    headers: { "X-List-Token": token },
  });
  if (!res.ok) throw new Error("Failed to remove item");
}

export async function reorderListApi(id: string, token: string, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/api/lists/${id}/reorder`, {
    method: "PUT",
    headers: tokenHeaders(token),
    body: JSON.stringify({ paper_ids: orderedIds }),
  });
  if (!res.ok) throw new Error("Failed to reorder list");
}

export async function importBulk(id: string, token: string, rawText: string): Promise<ImportResult> {
  const res = await fetch(`${API_BASE}/api/lists/${id}/import`, {
    method: "POST",
    headers: tokenHeaders(token),
    body: JSON.stringify({ raw_text: rawText }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}
