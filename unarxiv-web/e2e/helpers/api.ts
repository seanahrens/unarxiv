import { API_BASE, ADMIN_PASSWORD } from "./fixtures";

export async function getPaper(id: string): Promise<any | null> {
  const res = await fetch(`${API_BASE}/api/papers/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`getPaper failed: ${res.status}`);
  return res.json();
}

export async function findCompletePaper(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/papers?sort=popular`);
  if (!res.ok) throw new Error(`findCompletePaper failed: ${res.status}`);
  const data = await res.json();
  const paper = data.papers.find((p: any) => p.status === "complete");
  if (!paper) throw new Error("No complete paper found in prod");
  return paper.id;
}

export async function adminVerify(password: string): Promise<Response> {
  return fetch(`${API_BASE}/api/admin/verify`, {
    method: "POST",
    headers: { "X-Admin-Password": password },
  });
}

export async function adminDeletePaper(
  id: string,
  password: string
): Promise<Response> {
  return fetch(`${API_BASE}/api/papers/${id}`, {
    method: "DELETE",
    headers: { "X-Admin-Password": password },
  });
}

/** Convenience wrapper for test teardown: uses ADMIN_PASSWORD env and throws on failure. */
export async function cleanupTestPaper(id: string): Promise<void> {
  if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD env required for cleanup");
  const res = await adminDeletePaper(id, ADMIN_PASSWORD);
  if (res.ok || res.status === 404) return;
  throw new Error(`Cleanup failed for ${id}: ${res.status}`);
}
