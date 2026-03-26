import { getUserToken } from "./userToken";
import { VOICE_TIERS } from "./voiceTiers";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.unarxiv.org";

/** Returns headers with X-User-Token for identity-dependent API calls. */
function userHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getUserToken();
  if (token) headers["X-User-Token"] = token;
  return headers;
}

export interface Paper {
  id: string;
  arxiv_url: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date: string;
  status: string;
  error_message: string | null;
  error_category: string | null;
  retry_count: number;
  progress_detail: string | null;
  eta_seconds: number | null;
  audio_url: string | null;
  audio_size_bytes: number | null;
  duration_seconds: number | null;
  best_version_id: number | null;
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
  status?: string;
}): Promise<PaperListResponse> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.per_page) searchParams.set("per_page", String(params.per_page));
  if (params.status) searchParams.set("status", params.status);

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
  const headers = userHeaders({ "Content-Type": "application/json" });
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
  const headers = userHeaders({ "Content-Type": "application/json" });
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
    headers: userHeaders({ "X-Admin-Password": password }),
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

export async function clearPremiumVersionsApi(id: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/papers/${id}/premium-versions`, {
    method: "DELETE",
    headers: { "X-Admin-Password": password },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
}

export async function recordVisit(id: string): Promise<void> {
  fetch(`${API_BASE}/api/papers/${id}/visit`, { method: "POST", headers: userHeaders() }).catch(() => {});
}

// --- Ratings ---

export interface Rating {
  paper_id: string;
  stars: number;
  comment: string;
  voice_tier: string | null;  // 'plus3' | 'plus2' | 'plus1' | null (legacy)
  created_at: string;
  updated_at: string;
}

export async function fetchRating(paperId: string): Promise<Rating | null> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/rating`, { headers: userHeaders() });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.rating === null ? null : data;
}

export async function submitRating(paperId: string, stars: number, comment: string): Promise<Rating> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/rating`, {
    method: "POST",
    headers: userHeaders({ "Content-Type": "application/json" }),
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
    headers: userHeaders(),
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
  best_narration_tier: string | null;
}

export interface AdminRating {
  stars: number;
  comment: string;
  voice_tier: string | null;  // 'plus3' | 'plus2' | 'plus1' | null (legacy)
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

export interface AdminList {
  id: string;
  name: string;
  description: string;
  owner_token: string;
  creator_ip: string | null;
  created_at: string;
  paper_count: number;
}

export async function fetchAdminLists(password: string): Promise<AdminList[]> {
  const res = await fetch(`${API_BASE}/api/admin/lists`, {
    headers: { "X-Admin-Password": password },
  });
  if (!res.ok) throw new Error("Failed to fetch lists");
  const data = await res.json();
  return data.lists;
}

export async function deleteListAdmin(listId: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/lists/${listId}`, {
    method: "DELETE",
    headers: { "X-Admin-Password": password },
  });
  if (!res.ok) throw new Error("Failed to delete list");
}

export function audioUrl(id: string): string {
  return `${API_BASE}/api/papers/${id}/audio`;
}

export function transcriptUrl(id: string, versionId?: number): string {
  const base = `${API_BASE}/api/papers/${id}/transcript`;
  return versionId != null ? `${base}?version=${versionId}` : base;
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
  return status === "narrating";
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

// Extract an arXiv ID — new format (YYMM.NNNNN) or old format (category/YYMMNNN) with optional vN.
const ARXIV_NEW_RE = /(\d{4}\.\d{4,5})(v\d+)?/;
const ARXIV_OLD_RE = /([a-z-]+\/\d{7})(v\d+)?/i;

export function isArxivUrl(input: string): boolean {
  const t = input.trim();
  return ARXIV_NEW_RE.test(t) || ARXIV_OLD_RE.test(t);
}

// --- ArXiv API Search ---

export interface ArxivSearchResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date: string;
  arxiv_url: string;
}

export interface ArxivSearchResponse {
  papers: ArxivSearchResult[];
  total: number;
  page: number;
  per_page: number;
}

export async function searchArxiv(query: string, page: number = 1, perPage: number = 10): Promise<ArxivSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    per_page: String(perPage),
  });
  const res = await fetch(`${API_BASE}/api/arxiv/search?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// --- Playlist (backend) ---

export async function getPlaylistApi(): Promise<{ paperId: string; addedAt: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/api/playlist`, { headers: userHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.playlist || [];
  } catch { return []; }
}

export async function setPlaylistApi(paperIds: string[]): Promise<void> {
  await fetch(`${API_BASE}/api/playlist`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...userHeaders() },
    body: JSON.stringify({ paperIds }),
  }).catch(() => {});
}

export async function addToPlaylistApi(paperId: string): Promise<void> {
  await fetch(`${API_BASE}/api/playlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...userHeaders() },
    body: JSON.stringify({ paperId }),
  }).catch(() => {});
}

export async function removeFromPlaylistApi(paperId: string): Promise<void> {
  await fetch(`${API_BASE}/api/playlist/${paperId}`, {
    method: "DELETE",
    headers: userHeaders(),
  }).catch(() => {});
}

// --- Listen History (backend) ---

export async function getListenHistoryApi(): Promise<{ paperId: string; readAt: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/api/listen-history`, { headers: userHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.history || [];
  } catch { return []; }
}

export async function markListenedApi(paperId: string): Promise<void> {
  await fetch(`${API_BASE}/api/papers/${paperId}/listened`, {
    method: "POST",
    headers: userHeaders(),
  }).catch(() => {});
}

export async function unmarkListenedApi(paperId: string): Promise<void> {
  await fetch(`${API_BASE}/api/papers/${paperId}/listened`, {
    method: "DELETE",
    headers: userHeaders(),
  }).catch(() => {});
}

// --- Token Merge ---

export async function mergeTokensApi(oldToken: string, newToken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/merge-tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldToken, newToken }),
  });
  if (!res.ok) throw new Error("Failed to merge tokens");
}

// --- Playback Positions ---

export async function savePlaybackPositionApi(paperId: string, position: number): Promise<void> {
  await fetch(`${API_BASE}/api/papers/${paperId}/position`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...userHeaders() },
    body: JSON.stringify({ position }),
  });
  // Fire-and-forget: don't throw on failure (offline graceful degradation)
}

export async function getPlaybackPositionsApi(): Promise<Record<string, { position: number; updated_at: string }>> {
  try {
    const res = await fetch(`${API_BASE}/api/playback-positions`, {
      headers: userHeaders(),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.positions || {};
  } catch {
    return {}; // Graceful offline degradation
  }
}

export function extractArxivId(input: string): string | null {
  const t = input.trim();
  const newFmt = t.match(ARXIV_NEW_RE);
  if (newFmt) return newFmt[1];
  const oldFmt = t.match(ARXIV_OLD_RE);
  if (oldFmt) return oldFmt[1];
  return null;
}

// --- Premium Narration ---

export interface PremiumOptionEstimate {
  option_id: string;          // e.g. "plus2", "plus3", "plus1"
  display_name: string;       // e.g. "OpenAI TTS"
  tagline: string;            // one-liner
  estimated_cost_usd: number; // total cost for this paper
  llm_cost_usd: number;
  tts_cost_usd: number;
  available: boolean;
}

export interface PremiumEstimateResponse {
  paper_id: string;
  word_count: number;
  options: PremiumOptionEstimate[];
  has_existing_script: boolean;
}

/** Map a TTS provider from the raw API to the simplified tier ID used by the modal. */
function ttsProviderToTierId(ttsProvider: string | null): string {
  if (!ttsProvider || ttsProvider === "free") return "plus1";
  if (ttsProvider === "elevenlabs") return "plus3";
  if (ttsProvider === "openai") return "plus2";
  if (ttsProvider === "google") return "google";
  return ttsProvider;
}


export async function getPremiumEstimate(paperId: string): Promise<PremiumEstimateResponse> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/estimate`, {
    headers: userHeaders(),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const raw = await res.json() as {
    estimated: boolean;
    script_char_count: number;
    has_existing_script?: boolean;
    options: { id: string; tts_provider: string | null; total_cost: number; llm_cost: number; tts_cost: number; quality_rank: number }[];
  };

  if (!raw.estimated || !raw.options) {
    return { paper_id: paperId, word_count: 0, options: [], has_existing_script: false };
  }

  // Aggregate raw options by TTS provider tier, picking cheapest LLM for each
  const byTier = new Map<string, { total: number; llm: number; tts: number }>();
  for (const opt of raw.options) {
    const tier = ttsProviderToTierId(opt.tts_provider);
    const existing = byTier.get(tier);
    if (!existing || opt.total_cost < existing.total) {
      byTier.set(tier, { total: opt.total_cost, llm: opt.llm_cost, tts: opt.tts_cost });
    }
  }

  const options: PremiumOptionEstimate[] = [];
  for (const [tierId, costs] of byTier) {
    options.push({
      option_id: tierId,
      display_name: tierId,
      tagline: "",
      estimated_cost_usd: costs.total,
      llm_cost_usd: costs.llm,
      tts_cost_usd: costs.tts,
      available: true,
    });
  }

  // Sort: highest quality tier first
  options.sort((a, b) => (VOICE_TIERS[b.option_id]?.rank ?? 0) - (VOICE_TIERS[a.option_id]?.rank ?? 0));

  return { paper_id: paperId, word_count: raw.script_char_count, options, has_existing_script: !!raw.has_existing_script };
}

export interface PremiumNarrationConfig {
  option_id: string;
  /** Encrypted API keys — opaque ciphertext from /api/keys/encrypt */
  encrypted_keys: Partial<Record<string, string>>;
  /** If the user chose a separate LLM provider (for dual-key options) */
  llm_provider?: string;
}

export async function requestPremiumNarration(
  paperId: string,
  config: PremiumNarrationConfig
): Promise<Paper> {
  // Transform frontend config to worker request format
  let body: Record<string, string | undefined>;
  const optionId = config.option_id;

  if (optionId === "plus2") {
    // OpenAI uses a unified key for both LLM and TTS
    body = {
      type: "unified",
      provider: "openai",
      encrypted_key: config.encrypted_keys["openai"],
    };
  } else if (optionId === "plus3") {
    // ElevenLabs needs a separate TTS key + LLM provider key
    const llmProv = config.llm_provider ?? "openai";
    body = {
      type: "dual",
      tts_provider: "elevenlabs",
      encrypted_tts_key: config.encrypted_keys["elevenlabs"],
      llm_provider: llmProv,
      encrypted_llm_key: config.encrypted_keys[llmProv],
    };
  } else {
    // plus1 voice: server-sponsored LLM scripting (no user key needed)
    body = {
      type: "sponsored_plus1",
    };
  }

  const headers = userHeaders({ "Content-Type": "application/json" });
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/narrate-premium`, {
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

export interface EncryptKeyResponse {
  encrypted_key: string;
  provider: string;
}

export async function encryptKey(provider: string, rawKey: string): Promise<EncryptKeyResponse> {
  const res = await fetch(`${API_BASE}/api/keys/encrypt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key: rawKey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return res.json();
}

export interface ValidateKeyResponse {
  valid: boolean;
  error?: string;
  info?: string;
}

export async function validateKey(
  provider: string,
  encryptedKey: string
): Promise<ValidateKeyResponse> {
  const res = await fetch(`${API_BASE}/api/keys/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, encrypted_key: encryptedKey }),
  });
  if (!res.ok) return { valid: false, error: "Validation request failed" };
  return res.json();
}

export interface PaperVersion {
  id: number;
  narration_tier: string;  // "base" | "plus1" | "plus2" | "plus3"
  quality_rank: number;    // higher = better quality
  tts_provider: string | null;
  tts_model: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  audio_url: string | null;
  duration_seconds: number | null;
  is_best: boolean;
  created_at: string;
  score_fidelity: number | null;
  score_citations: number | null;
  score_header: number | null;
  score_figures: number | null;
  score_tts: number | null;
  score_overall: number | null;
}

export interface PaperVersionsResponse {
  versions: PaperVersion[];
  best_version_id: number | null;
  best_version: PaperVersion | null;
  is_narrating: boolean;
}

export async function getPaperVersions(paperId: string): Promise<PaperVersionsResponse> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/versions`, {
    headers: userHeaders(),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json() as { versions: PaperVersion[]; best_version_id: number | null; is_narrating?: boolean };
  const best = data.versions.find((v) => v.is_best) ?? null;
  return { ...data, best_version: best, is_narrating: !!data.is_narrating };
}
