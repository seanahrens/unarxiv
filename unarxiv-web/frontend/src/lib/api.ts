export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.unarxiv.org";

export interface Paper {
  id: string;
  arxiv_url: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date: string;
  status: string;
  error_message: string | null;
  progress_detail: string | null;
  audio_url: string | null;
  audio_size_bytes: number | null;
  duration_seconds: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface PaperListResponse {
  papers: Paper[];
  page: number;
  per_page: number;
}

export async function fetchPapers(params: {
  q?: string;
  sort?: string;
  page?: number;
  per_page?: number;
}): Promise<PaperListResponse> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.per_page) searchParams.set("per_page", String(params.per_page));

  const res = await fetch(`${API_BASE}/api/papers?${searchParams}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchPaper(id: string): Promise<Paper> {
  const res = await fetch(`${API_BASE}/api/papers/${id}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Paper not found");
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export async function fetchPapersBatch(ids: string[]): Promise<Paper[]> {
  if (ids.length === 0) return [];
  try {
    const res = await fetch(`${API_BASE}/api/papers/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    return data.papers;
  } catch {
    // Fallback: fetch individually
    const results = await Promise.allSettled(ids.map((id) => fetchPaper(id)));
    return results
      .filter((r): r is PromiseFulfilledResult<Paper> => r.status === "fulfilled")
      .map((r) => r.value);
  }
}

export async function fetchMyAdditions(): Promise<Paper[]> {
  try {
    const res = await fetch(`${API_BASE}/api/my-additions`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.papers;
  } catch {
    return [];
  }
}

export async function deleteMyAddition(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/my-additions/${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ArxivMetadata {
  id: string;
  arxiv_url: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date: string;
  tex_source_url: string;
}

export async function previewPaper(arxivUrl: string): Promise<ArxivMetadata> {
  const res = await fetch(`${API_BASE}/api/papers/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arxiv_url: arxivUrl }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function submitPaper(
  arxivUrl: string,
  metadata?: ArxivMetadata
): Promise<Paper> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const adminPw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("admin_password") : null;
  if (adminPw) headers["X-Admin-Password"] = adminPw;

  const res = await fetch(`${API_BASE}/api/papers`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      arxiv_url: arxivUrl,
      metadata,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function requestNarration(
  paperId: string,
  turnstileToken?: string,
  sourcePriority?: "latex" | "pdf"
): Promise<Paper> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const adminPw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("admin_password") : null;
  if (adminPw) headers["X-Admin-Password"] = adminPw;

  const body: Record<string, string> = {};
  if (turnstileToken) body.turnstile_token = turnstileToken;
  if (sourcePriority) body.source_priority = sourcePriority;

  const res = await fetch(`${API_BASE}/api/papers/${paperId}/narrate`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function checkNarrationRateLimit(): Promise<{ captcha_required: boolean }> {
  const res = await fetch(`${API_BASE}/api/narration-check`);
  if (!res.ok) return { captcha_required: false };
  return res.json();
}

export interface Contributor {
  name: string;
  location: string;
  paper_count: number;
  is_you: boolean;
}

export async function fetchAdminStats(password: string): Promise<{ contributors: Contributor[]; your_paper_ids: string[] }> {
  const res = await fetch(`${API_BASE}/api/admin/stats`, {
    headers: { "X-Admin-Password": password },
  });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/admin/verify`, {
    method: "POST",
    headers: { "X-Admin-Password": password },
  });
  return res.ok;
}

export async function reprocessPaperApi(
  id: string,
  password: string,
  wipeReviews: boolean = false,
  mode: "full" | "script_only" | "narration_only" = "full",
  sourcePriority?: "latex" | "pdf"
): Promise<Paper> {
  const body: Record<string, unknown> = { wipe_reviews: wipeReviews, mode };
  if (sourcePriority) body.source_priority = sourcePriority;

  const res = await fetch(`${API_BASE}/api/papers/${id}/reprocess`, {
    method: "POST",
    headers: { "X-Admin-Password": password, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function deletePaperApi(id: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/papers/${id}`, {
    method: "DELETE",
    headers: { "X-Admin-Password": password },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
}

export async function recordVisit(id: string): Promise<void> {
  fetch(`${API_BASE}/api/papers/${id}/visit`, { method: "POST" }).catch(() => {});
}

// --- Ratings ---

export interface Rating {
  paper_id: string;
  stars: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export async function fetchRating(paperId: string): Promise<Rating | null> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/rating`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.rating === null ? null : data;
}

export async function submitRating(paperId: string, stars: number, comment: string): Promise<Rating> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/rating`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stars, comment }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}

export async function deleteRating(paperId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/rating`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
}

export interface PaperWithRating extends Paper {
  avg_rating: number | null;
  rating_count: number;
  has_low_rating: boolean;
}

export interface AdminRating {
  stars: number;
  comment: string;
  created_at: string;
}

export async function fetchPaperRatings(paperId: string, password: string): Promise<AdminRating[]> {
  const res = await fetch(`${API_BASE}/api/admin/papers/${paperId}/ratings`, {
    headers: { "X-Admin-Password": password },
  });
  if (!res.ok) throw new Error("Failed to fetch ratings");
  const data = await res.json();
  return data.ratings;
}

export async function clearPaperRatings(paperIds: string[], password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/clear-ratings`, {
    method: "POST",
    headers: { "X-Admin-Password": password, "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds }),
  });
  if (!res.ok) throw new Error("Failed to clear ratings");
}

export async function fetchPapersForCurate(password: string): Promise<PaperWithRating[]> {
  const res = await fetch(`${API_BASE}/api/admin/papers-with-ratings`, {
    headers: { "X-Admin-Password": password },
  });
  if (!res.ok) throw new Error("Failed to fetch papers");
  const data = await res.json();
  return data.papers;
}

export function audioUrl(id: string): string {
  return `${API_BASE}/api/papers/${id}/audio`;
}

export function transcriptUrl(id: string): string {
  return `${API_BASE}/api/papers/${id}/transcript`;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function formatDurationShort(seconds: number): string {
  const mins = seconds / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

export function isInProgress(status: string): boolean {
  return ["queued", "preparing", "generating_audio"].includes(status);
}

export function formatAuthors(authors: string[], maxShown = 3): string {
  if (authors.length === 0) return "";
  if (authors.length <= maxShown) return authors.join(", ");
  return `${authors.slice(0, maxShown).join(", ")} + ${authors.length - maxShown} more`;
}

export function formatPaperDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatPaperYear(dateStr: string): string {
  return dateStr?.slice(0, 4) || "";
}

/** Parse "eta:240" or "30%|eta:240" progress_detail → seconds remaining, or null. */
export function parseEtaSeconds(detail: string | null): number | null {
  if (!detail) return null;
  const m = detail.match(/eta:(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// Extract an arXiv ID (YYMM.NNNNN with optional vN) from anywhere in a string.
const ARXIV_ID_RE = /(\d{4}\.\d{4,5})(v\d+)?/;

export function isArxivUrl(input: string): boolean {
  return ARXIV_ID_RE.test(input.trim());
}

export function extractArxivId(input: string): string | null {
  const m = input.trim().match(ARXIV_ID_RE);
  return m ? m[1] : null; // m[1] is the base ID without version suffix
}
