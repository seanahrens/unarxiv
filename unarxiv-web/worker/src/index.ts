/**
 * unarXiv API — Cloudflare Worker
 *
 * See buildRouteTable() below for the complete list of API routes.
 */

import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import type { Env, Paper, PaperStatus } from "./types";
import { paperToResponse } from "./types";
import { parseArxivId, scrapeArxivMetadata, searchArxiv, arxivSrcUrl, arxivPdfUrl } from "./arxiv";
import {
  getPaper,
  getPapersBatch,
  insertPaper,
  updatePaperStatus,
  searchPapers,
  getPopularPapers,
  getRecentPapers,
  getAllPapers,
  deletePaper,
  resetPaperForReprocess,
  getTopContributors,
  recordVisit,
  getSubmissionCount,
  recordSubmission,
  claimPaperForNarration,
  claimPaperForPremium,
  cleanup,
  getRating,
  upsertRating,
  deleteRating,
  getAllPapersWithRatings,
  hasAnyLowRatings,
  getAllRatingsForPaper,
  clearRatingsForPaper,
  getPapersBySubmitterIp,
  getPapersBySubmitterToken,
  generateListId,
  createList,
  getList,
  getListsByToken,
  getAllLists,
  updateList,
  deleteList,
  getListItems,
  addListItems,
  removeListItem,
  reorderListItems,
  getRecentPublicLists,
  mergeTokens,
  savePlaybackPosition,
  getPlaybackPositions,
  getUserPlaylist,
  setUserPlaylist,
  addToUserPlaylist,
  removeFromUserPlaylist,
  getUserListenHistory,
  markPaperListened,
  unmarkPaperListened,
  insertNarrationVersion,
  getNarrationVersions,
  getVersionById,
  updateBestVersionId,
  updateScriptCharCount,
  getBestVoiceTier,
} from "./db";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const origin = request.headers.get("Origin") || "";
    const isAllowed =
      origin === "https://unarxiv.org" || origin.startsWith("http://localhost:");
    const corsOrigin = isAllowed ? origin : "https://unarxiv.org";
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password, X-List-Token, X-User-Token",
      "Access-Control-Expose-Headers": "Last-Modified",
    };

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const response = await handleRequest(request, env, url, path, method, ctx);
      // Add CORS headers to all responses
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
      }

      return response;
    } catch (e: any) {
      console.error("Unhandled error:", e);
      return json({ error: "Internal server error" }, 500, corsHeaders);
    }
  },

  // Scheduled: cleanup old data + recover stuck narrations
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await cleanup(env.DB);
    await recoverStalePapers(env);
  },
};

/** Pattern for a 6-character list ID (lowercase alphanumeric). */
const LIST_ID_PATTERN = "[a-z0-9]{6}";

// ─── Inline handlers extracted for the route table ───────────────────────────

async function handleBatchPapers(request: Request, env: Env, baseUrl: string): Promise<Response> {
  const body = await request.json<{ ids?: string[] }>();
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return json({ error: "ids must be a non-empty array" }, 400);
  }
  if (ids.length > 50) {
    return json({ error: "Maximum 50 IDs per request" }, 400);
  }
  const papers = await getPapersBatch(env.DB, ids);
  return json({ papers: papers.map((p) => paperToResponse(p, baseUrl)) });
}

async function handleRating(request: Request, env: Env, paperId: string): Promise<Response> {
  const method = request.method;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const token = request.headers.get("X-User-Token") || null;
  if (method === "GET") {
    const rating = await getRating(env.DB, paperId, ip, token);
    if (!rating) return json({ rating: null });
    return json({
      paper_id: rating.paper_id,
      stars: rating.stars,
      comment: rating.comment,
      voice_tier: rating.voice_tier,
      created_at: rating.created_at,
      updated_at: rating.updated_at,
    });
  }
  if (method === "POST") {
    const body = await request.json<{ stars?: number; comment?: string }>();
    const stars = body.stars;
    if (!stars || stars < 1 || stars > 5) {
      return json({ error: "stars must be 1-5" }, 400);
    }
    const comment = (body.comment || "").slice(0, 2000);
    // Record which voice tier was the best available when this review was written
    const voiceTier = await getBestVoiceTier(env.DB, paperId);
    const rating = await upsertRating(env.DB, paperId, ip, stars, comment, token, voiceTier);
    return json({
      paper_id: rating.paper_id,
      stars: rating.stars,
      comment: rating.comment,
      voice_tier: rating.voice_tier,
      created_at: rating.created_at,
      updated_at: rating.updated_at,
    });
  }
  if (method === "DELETE") {
    await deleteRating(env.DB, paperId, ip, token);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}

async function handleMyAdditions(request: Request, env: Env, baseUrl: string): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const token = request.headers.get("X-User-Token") || null;
  let papers: Paper[];
  if (token) {
    const byToken = await getPapersBySubmitterToken(env.DB, token);
    const byIp = await getPapersBySubmitterIp(env.DB, ip);
    // Merge and deduplicate (token results first)
    const seen = new Set(byToken.map((p) => p.id));
    papers = [...byToken, ...byIp.filter((p) => !seen.has(p.id))];
  } else {
    papers = await getPapersBySubmitterIp(env.DB, ip);
  }
  return json({ papers: papers.map((p) => paperToResponse(p, baseUrl)) });
}

async function handleDeleteMyAddition(request: Request, env: Env, id: string): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const token = request.headers.get("X-User-Token") || null;
  const paper = await getPaper(env.DB, id);
  if (!paper) return json({ error: "Paper not found" }, 404);
  const isOwner = (token && paper.submitted_by_token === token) || paper.submitted_by_ip === ip;
  if (!isOwner) return json({ error: "Not your paper" }, 403);
  if (paper.audio_r2_key) {
    try { await env.AUDIO_BUCKET.delete(paper.audio_r2_key); } catch {}
  }
  await deletePaper(env.DB, id);
  return json({ ok: true });
}

async function handleAdminVerify(request: Request, env: Env): Promise<Response> {
  const password = request.headers.get("X-Admin-Password");
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return json({ error: "Invalid password" }, 401);
  }
  return json({ ok: true });
}

async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const raw = await getTopContributors(env.DB, 10);
  const callerIp = request.headers.get("CF-Connecting-IP") || "";
  const callerToken = request.headers.get("X-User-Token") || "";
  const names = ["Alice", "Bob", "Charlie", "Dana", "Eli", "Faye", "Gus", "Hana", "Ivan", "Jia",
                 "Kai", "Luna", "Max", "Nora", "Omar", "Pia", "Quinn", "Ravi", "Sara", "Teo"];
  const contributors = raw.map((c, i) => {
    const isYou = (callerToken && c.token === callerToken) || c.ip === callerIp;
    return {
      name: isYou ? "You" : names[i] || `User ${i + 1}`,
      location: [c.city, c.country].filter(Boolean).join(", ") || "Unknown",
      paper_count: c.paper_count,
      is_you: isYou,
    };
  });
  const youEntry = raw.find((c) => (callerToken && c.token === callerToken) || c.ip === callerIp);
  const yourPaperIds = youEntry
    ? (await env.DB.prepare("SELECT id FROM papers WHERE submitted_by_token = ? OR submitted_by_ip = ?").bind(callerToken || "", callerIp).all<{ id: string }>()).results.map((r) => r.id)
    : [];
  return json({ contributors, your_paper_ids: yourPaperIds });
}

async function handleAdminPapersWithRatings(request: Request, env: Env, baseUrl: string): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const papers = await getAllPapersWithRatings(env.DB);
  return json({
    papers: papers.map((p) => ({
      ...paperToResponse(p, baseUrl),
      avg_rating: p.bayesian_avg,
      rating_count: p.rating_count || 0,
      has_low_rating: !!p.has_low_rating,
    })),
  });
}

async function handleAdminPaperRatings(request: Request, env: Env, paperId: string): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const ratings = await getAllRatingsForPaper(env.DB, paperId);
  return json({ ratings: ratings.map((r) => ({ stars: r.stars, comment: r.comment, voice_tier: r.voice_tier, created_at: r.created_at })) });
}

async function handleAdminClearRatings(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const body = await request.json<{ paper_ids: string[] }>();
  if (!body.paper_ids || !Array.isArray(body.paper_ids)) {
    return json({ error: "paper_ids array required" }, 400);
  }
  for (const id of body.paper_ids) {
    await clearRatingsForPaper(env.DB, id);
  }
  return json({ ok: true, cleared: body.paper_ids.length });
}

async function handleAdminHasLowRatings(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const hasLow = await hasAnyLowRatings(env.DB);
  return json({ has_low_ratings: hasLow });
}

async function handleAdminLists(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const lists = await getAllLists(env.DB);
  return json({
    lists: lists.map((l) => ({
      id: l.id, name: l.name, description: l.description, owner_token: l.owner_token,
      creator_ip: l.creator_ip, created_at: l.created_at, paper_count: l.paper_count,
    })),
  });
}

async function handleCreateList(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ name?: string; description?: string; publicly_listed?: boolean }>();
  if (!body.name || !body.name.trim()) {
    return json({ error: "name is required" }, 400);
  }
  if (body.name.trim().length > 200) {
    return json({ error: "name must be 200 characters or fewer" }, 400);
  }
  if ((body.description || "").trim().length > 1000) {
    return json({ error: "description must be 1000 characters or fewer" }, 400);
  }
  const id = await generateListId(env.DB);
  const ownerToken = crypto.randomUUID().replace(/-/g, "");
  const ip = request.headers.get("CF-Connecting-IP") || null;
  const publiclyListed = body.publicly_listed === false ? 0 : 1;
  const list = await createList(env.DB, id, ownerToken, body.name.trim(), (body.description || "").trim(), ip, publiclyListed);
  return json({
    list: { id: list.id, name: list.name, description: list.description, publicly_listed: !!list.publicly_listed, created_at: list.created_at, updated_at: list.updated_at, paper_count: 0 },
    owner_token: ownerToken,
  }, 201);
}

async function handleMyLists(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  if (!token) return json({ error: "X-List-Token header required" }, 401);
  const lists = await getListsByToken(env.DB, token);
  return json({
    lists: lists.map((l) => ({
      id: l.id, name: l.name, description: l.description, publicly_listed: !!l.publicly_listed,
      created_at: l.created_at, updated_at: l.updated_at, paper_count: l.paper_count,
    })),
  });
}

async function handleRecentLists(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10")));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0"));
  const lists = await getRecentPublicLists(env.DB, limit, offset);
  return json({
    lists: lists.map((l) => ({
      id: l.id, name: l.name, description: l.description, publicly_listed: !!l.publicly_listed,
      created_at: l.created_at, updated_at: l.updated_at, paper_count: l.paper_count,
    })),
  });
}

async function handleGetList(request: Request, env: Env, listId: string, baseUrl: string): Promise<Response> {
  const list = await getList(env.DB, listId);
  if (!list) return json({ error: "List not found" }, 404);
  const items = await getListItems(env.DB, list.id);
  const paperIds = items.map((i) => i.paper_id);
  const papers = paperIds.length > 0 ? await getPapersBatch(env.DB, paperIds) : [];
  const paperMap = new Map(papers.map((p) => [p.id, p]));
  const orderedPapers = paperIds.map((id) => {
    const p = paperMap.get(id);
    return p ? paperToResponse(p, baseUrl) : { id, not_found: true };
  });
  return json({
    list: { id: list.id, name: list.name, description: list.description, publicly_listed: !!list.publicly_listed, created_at: list.created_at, updated_at: list.updated_at, paper_count: items.length },
    papers: orderedPapers,
  });
}

async function handleUpdateList(request: Request, env: Env, listId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  const body = await request.json<{ name?: string; description?: string; publicly_listed?: boolean }>();
  if (body.name !== undefined && body.name.trim().length > 200) {
    return json({ error: "name must be 200 characters or fewer" }, 400);
  }
  if (body.description !== undefined && body.description.trim().length > 1000) {
    return json({ error: "description must be 1000 characters or fewer" }, 400);
  }
  const publiclyListed = body.publicly_listed !== undefined ? (body.publicly_listed ? 1 : 0) : undefined;
  await updateList(env.DB, list.id, (body.name ?? list.name).trim(), (body.description ?? list.description).trim(), publiclyListed);
  return json({ ok: true });
}

async function handleDeleteList(request: Request, env: Env, listId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const adminPw = request.headers.get("X-Admin-Password");
  const isAdmin = adminPw && adminPw === env.ADMIN_PASSWORD;
  const list = await getList(env.DB, listId);
  if (!list) return json({ error: "Not found" }, 404);
  if (!isAdmin && list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  await deleteList(env.DB, list.id);
  return json({ ok: true });
}

async function handleAddListItems(request: Request, env: Env, listId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  const body = await request.json<{ paper_ids?: string[] }>();
  if (!body.paper_ids || !Array.isArray(body.paper_ids)) {
    return json({ error: "paper_ids array required" }, 400);
  }
  const added = await addListItems(env.DB, list.id, body.paper_ids);
  return json({ ok: true, added });
}

async function handleRemoveListItem(request: Request, env: Env, listId: string, paperId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  await removeListItem(env.DB, list.id, paperId);
  return json({ ok: true });
}

async function handleReorderList(request: Request, env: Env, listId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  const body = await request.json<{ paper_ids?: string[] }>();
  if (!body.paper_ids || !Array.isArray(body.paper_ids)) {
    return json({ error: "paper_ids array required" }, 400);
  }
  await reorderListItems(env.DB, list.id, body.paper_ids);
  return json({ ok: true });
}

async function handleImportList(request: Request, env: Env, listId: string, baseUrl: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  const body = await request.json<{ raw_text?: string }>();
  if (!body.raw_text) return json({ error: "raw_text required" }, 400);

  const chunks = body.raw_text.split(/[\s,;]+/).filter(Boolean);
  const parsed = new Map<string, boolean>();
  const invalid: string[] = [];
  for (const chunk of chunks) {
    const id = parseArxivId(chunk);
    if (id) {
      parsed.set(id, true);
    } else if (chunk.trim()) {
      invalid.push(chunk);
    }
  }

  const ids = [...parsed.keys()];
  if (ids.length === 0) {
    return json({ added: [], invalid });
  }

  const existing = await getPapersBatch(env.DB, ids);
  const existingIds = new Set(existing.map((p) => p.id));
  const missing = ids.filter((id) => !existingIds.has(id));

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const importToken = request.headers.get("X-User-Token") || undefined;
  const cf = (request as Request<unknown, IncomingRequestCfProperties>).cf;
  const toAdd = missing.slice(0, 20);
  for (const arxivId of toAdd) {
    try {
      const meta = await scrapeArxivMetadata(arxivId);
      await insertPaper(env.DB, {
        id: meta.id,
        arxiv_url: meta.arxiv_url,
        title: meta.title,
        authors: meta.authors,
        abstract: meta.abstract,
        published_date: meta.published_date,
        submitted_by_ip: ip,
        submitted_by_token: importToken,
        submitted_by_country: cf?.country || undefined,
        submitted_by_city: cf?.city || undefined,
      });
    } catch {
      invalid.push(arxivId);
    }
  }
  for (const id of missing.slice(20)) {
    invalid.push(id);
  }

  const validIds = ids.filter((id) => !invalid.includes(id));
  const actuallyAdded = await addListItems(env.DB, list.id, validIds);
  const duplicateCount = validIds.length - actuallyAdded;

  const allPapers = validIds.length > 0 ? await getPapersBatch(env.DB, validIds) : [];
  return json({
    added: allPapers.map((p) => paperToResponse(p, baseUrl)),
    duplicates: duplicateCount,
    invalid,
  });
}

// --- Playlist endpoints ---

async function handleGetPlaylist(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  const items = await getUserPlaylist(env.DB, token);
  return json({ playlist: items.map((i) => ({ paperId: i.paper_id, addedAt: i.added_at })) });
}

async function handleUpdatePlaylist(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  const body = await request.json<{ paperIds?: string[] }>();
  if (!body.paperIds || !Array.isArray(body.paperIds)) {
    return json({ error: "paperIds array required" }, 400);
  }
  if (body.paperIds.length > 500) {
    return json({ error: "Playlist cannot exceed 500 items" }, 400);
  }
  await setUserPlaylist(env.DB, token, body.paperIds);
  return json({ ok: true });
}

async function handleAddToPlaylist(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  const body = await request.json<{ paperId?: string }>();
  if (!body.paperId) return json({ error: "paperId required" }, 400);
  const added = await addToUserPlaylist(env.DB, token, body.paperId);
  return json({ ok: true, added });
}

async function handleRemoveFromPlaylist(request: Request, env: Env, paperId: string): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  await removeFromUserPlaylist(env.DB, token, paperId);
  return json({ ok: true });
}

// --- Listen history endpoints ---

async function handleGetListenHistory(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  const items = await getUserListenHistory(env.DB, token);
  return json({ history: items.map((i) => ({ paperId: i.paper_id, readAt: i.read_at })) });
}

async function handleMarkListened(request: Request, env: Env, paperId: string): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  await markPaperListened(env.DB, token, paperId);
  return json({ ok: true });
}

async function handleUnmarkListened(request: Request, env: Env, paperId: string): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  await unmarkPaperListened(env.DB, token, paperId);
  return json({ ok: true });
}

async function handleMergeTokens(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ oldToken?: string; newToken?: string }>();
  if (!body.oldToken || !body.newToken || body.oldToken === body.newToken) {
    return json({ error: "oldToken and newToken are required and must differ" }, 400);
  }
  await mergeTokens(env.DB, body.oldToken, body.newToken);
  return json({ ok: true });
}

async function handleSavePosition(request: Request, env: Env, paperId: string): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token header required" }, 401);
  const body = await request.json<{ position?: number }>();
  if (typeof body.position !== "number" || body.position < 0) {
    return json({ error: "position must be a non-negative number" }, 400);
  }
  await savePlaybackPosition(env.DB, token, paperId, body.position);
  return json({ ok: true });
}

async function handleGetPositions(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token header required" }, 401);
  const positions = await getPlaybackPositions(env.DB, token);
  const map: Record<string, { position: number; updated_at: string }> = {};
  for (const p of positions) {
    map[p.paper_id] = { position: p.position, updated_at: p.updated_at };
  }
  return json({ positions: map });
}

// ─── Premium Narration ────────────────────────────────────────────────────────

/**
 * Pricing constants for cost estimation. Update these as provider pricing changes.
 * All costs are in USD.
 */
const PRICING = {
  llm: {
    openai: {
      "gpt-4o":      { input_per_1m_tokens: 2.50,  output_per_1m_tokens: 10.00 },
      "gpt-4o-mini": { input_per_1m_tokens: 0.15,  output_per_1m_tokens: 0.60  },
    },
    anthropic: {
      "claude-3-5-haiku-20241022":  { input_per_1m_tokens: 0.80,  output_per_1m_tokens: 4.00  },
      "claude-3-7-sonnet-20250219": { input_per_1m_tokens: 3.00,  output_per_1m_tokens: 15.00 },
    },
  },
  tts: {
    openai: {
      "tts-1":    { per_1m_chars: 15.00 },
      "tts-1-hd": { per_1m_chars: 30.00 },
    },
    elevenlabs: {
      "eleven_flash_v2_5":     { per_1m_chars: 30.00  },
      "eleven_multilingual_v2": { per_1m_chars: 180.00 },
    },
    google: {
      "standard": { per_1m_chars: 4.00  },
      "wavenet":  { per_1m_chars: 16.00 },
    },
  },
} as const;

/** Default models per provider. */
const DEFAULT_MODELS = {
  llm: {
    openai:    "gpt-4o-mini",
    anthropic: "claude-3-5-haiku-20241022",
  },
  tts: {
    openai:     "tts-1-hd",
    elevenlabs: "eleven_multilingual_v2",
    google:     "wavenet",
  },
} as const;

/**
 * Quality rank for a premium narration configuration.
 * Free narrations are rank 0; premium ranks start at 5.
 * Higher = better quality / more expensive.
 */
function computeQualityRank(ttsProvider: string | null, ttsModel: string | null): number {
  if (!ttsProvider) return 5; // premium script + free voice
  if (ttsProvider === "openai") {
    return ttsModel === "tts-1-hd" ? 25 : 15;
  }
  if (ttsProvider === "google") {
    return ttsModel === "wavenet" ? 20 : 10;
  }
  if (ttsProvider === "elevenlabs") {
    return ttsModel === "eleven_multilingual_v2" ? 45 : 35;
  }
  return 10;
}

/**
 * Derive a 256-bit AES-GCM CryptoKey from the ENCRYPTION_KEY secret.
 * Uses SHA-256 of the key material so any string length works.
 */
async function deriveAesKey(keyMaterial: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(keyMaterial);
  const hashed = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hashed, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Encrypt a plaintext string using AES-256-GCM. Returns base64(iv || ciphertext). */
async function aesEncrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  // btoa over binary string
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a base64(iv || ciphertext) string using AES-256-GCM. */
async function aesDecrypt(ciphertextB64: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plaintext);
}

/** Estimate cost for one (provider, model) combination from script char count. */
function estimateCost(
  llmProvider: string,
  llmModel: string,
  ttsProvider: string | null,
  ttsModel: string | null,
  scriptCharCount: number
): { llm_cost: number; tts_cost: number; total_cost: number } {
  // Rough token estimate: 1 token ≈ 4 chars. Output tokens ≈ script chars / 4.
  // Input tokens ≈ 30% of output (system prompt + abstract context).
  const outputTokens = scriptCharCount / 4;
  const inputTokens = outputTokens * 0.3;

  const llmPrices = (PRICING.llm as any)[llmProvider]?.[llmModel];
  const llm_cost = llmPrices
    ? (inputTokens * llmPrices.input_per_1m_tokens + outputTokens * llmPrices.output_per_1m_tokens) / 1_000_000
    : 0;

  const ttsPrices = ttsProvider ? (PRICING.tts as any)[ttsProvider]?.[ttsModel ?? ""] : null;
  const tts_cost = ttsPrices ? (scriptCharCount * ttsPrices.per_1m_chars) / 1_000_000 : 0;

  return { llm_cost, tts_cost, total_cost: llm_cost + tts_cost };
}

/** Make a lightweight test call to verify an API key. Returns { valid, info? }. */
async function validateProviderKey(
  provider: string,
  apiKey: string
): Promise<{ valid: boolean; info?: string; error?: string }> {
  try {
    if (provider === "openai") {
      // Use /v1/models as a lightweight auth check.
      // Project-scoped keys (sk-proj-*) may return 403 on this endpoint
      // even though the key is valid — treat 403 as valid.
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (resp.status === 401) return { valid: false, error: "Invalid API key" };
      if (resp.ok || resp.status === 403) return { valid: true, info: "OpenAI key valid" };
      return { valid: false, error: `OpenAI returned ${resp.status}` };
    }

    if (provider === "anthropic") {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (resp.status === 401) return { valid: false, error: "Invalid API key" };
      // 200 or 400 (bad request but key worked) = valid
      if (resp.ok || resp.status === 400) return { valid: true, info: "Anthropic key valid" };
      return { valid: false, error: `Anthropic returned ${resp.status}` };
    }

    if (provider === "elevenlabs") {
      const resp = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": apiKey },
      });
      if (resp.status === 401) return { valid: false, error: "Invalid API key" };
      if (!resp.ok) return { valid: false, error: `ElevenLabs returned ${resp.status}` };
      const data = await resp.json<{ subscription?: { character_limit?: number } }>();
      const limit = data?.subscription?.character_limit;
      return { valid: true, info: limit != null ? `${limit.toLocaleString()} char limit` : "ElevenLabs key valid" };
    }

    if (provider === "google") {
      // Google TTS uses the key as a query param — test with a minimal synthesis
      const resp = await fetch(
        `https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`
      );
      if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
        const body = await resp.json<{ error?: { message?: string } }>().catch(() => ({ error: undefined }));
        return { valid: false, error: body?.error?.message || `Google returned ${resp.status}` };
      }
      if (!resp.ok) return { valid: false, error: `Google returned ${resp.status}` };
      return { valid: true, info: "Google TTS key valid" };
    }

    return { valid: false, error: `Unknown provider: ${provider}` };
  } catch (e: any) {
    return { valid: false, error: `Network error: ${e.message}` };
  }
}

// --- Request shapes for narrate-premium ---

interface UnifiedKeyRequest {
  type: "unified";
  provider: string;        // 'openai' — handles both LLM and TTS
  encrypted_key: string;
  llm_model?: string;
  tts_model?: string;
}

interface DualKeyRequest {
  type: "dual";
  llm_provider: string;
  encrypted_llm_key: string;
  llm_model?: string;
  tts_provider: string;
  encrypted_tts_key: string;
  tts_model?: string;
}

interface FreeVoiceRequest {
  type: "free_voice";
  llm_provider: string;
  encrypted_llm_key: string;
  llm_model?: string;
}

type NarratePremiumRequest = UnifiedKeyRequest | DualKeyRequest | FreeVoiceRequest;

/** POST /api/papers/:id/narrate-premium */
async function handleNarratePremium(
  request: Request,
  env: Env,
  id: string,
  baseUrl: string,
  ctx?: ExecutionContext
): Promise<Response> {
  if (!env.ENCRYPTION_KEY) {
    return json({ error: "Premium narration not configured" }, 503);
  }

  const paper = await getPaper(env.DB, id);
  if (!paper) return json({ error: "Paper not found" }, 404);

  let body: NarratePremiumRequest;
  try {
    body = await request.json<NarratePremiumRequest>();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.type || !["unified", "dual", "free_voice"].includes(body.type)) {
    return json({ error: "type must be 'unified', 'dual', or 'free_voice'" }, 400);
  }

  const aesKey = await deriveAesKey(env.ENCRYPTION_KEY);

  // Decrypt and resolve provider/model/key combinations
  let llmProvider: string;
  let llmApiKey: string;
  let llmModel: string;
  let ttsProvider: string | null = null;
  let ttsApiKey: string | null = null;
  let ttsModel: string | null = null;

  try {
    if (body.type === "unified") {
      const req = body as UnifiedKeyRequest;
      if (!req.provider || !req.encrypted_key) {
        return json({ error: "provider and encrypted_key required" }, 400);
      }
      llmProvider = req.provider;
      llmApiKey = await aesDecrypt(req.encrypted_key, aesKey);
      llmModel = req.llm_model || (DEFAULT_MODELS.llm as any)[req.provider] || "gpt-4o-mini";
      ttsProvider = req.provider;
      ttsApiKey = llmApiKey; // same key
      ttsModel = req.tts_model || (DEFAULT_MODELS.tts as any)[req.provider] || "tts-1-hd";
    } else if (body.type === "dual") {
      const req = body as DualKeyRequest;
      if (!req.llm_provider || !req.encrypted_llm_key || !req.tts_provider || !req.encrypted_tts_key) {
        return json({ error: "llm_provider, encrypted_llm_key, tts_provider, encrypted_tts_key required" }, 400);
      }
      llmProvider = req.llm_provider;
      llmApiKey = await aesDecrypt(req.encrypted_llm_key, aesKey);
      llmModel = req.llm_model || (DEFAULT_MODELS.llm as any)[req.llm_provider] || "gpt-4o-mini";
      ttsProvider = req.tts_provider;
      ttsApiKey = await aesDecrypt(req.encrypted_tts_key, aesKey);
      ttsModel = req.tts_model || (DEFAULT_MODELS.tts as any)[req.tts_provider] || null;
    } else {
      // free_voice
      const req = body as FreeVoiceRequest;
      if (!req.llm_provider || !req.encrypted_llm_key) {
        return json({ error: "llm_provider and encrypted_llm_key required" }, 400);
      }
      llmProvider = req.llm_provider;
      llmApiKey = await aesDecrypt(req.encrypted_llm_key, aesKey);
      llmModel = req.llm_model || (DEFAULT_MODELS.llm as any)[req.llm_provider] || "gpt-4o-mini";
    }
  } catch {
    return json({ error: "Failed to decrypt key — was it encrypted with this server?" }, 400);
  }

  // Save previous status so we can revert correctly on dispatch failure
  const previousStatus = paper.status as PaperStatus;

  // Claim the paper atomically — premium upgrades also allow 'narrated' → 'narrating'
  const claimed = await claimPaperForPremium(env.DB, id);
  if (!claimed) {
    // Already narrating — still 200, return current state
    const current = await getPaper(env.DB, id);
    return json(paperToResponse(current!, baseUrl));
  }

  // Dispatch to Modal with decrypted keys (never persisted in D1)
  const dispatch = async () => {
    if (!env.MODAL_FUNCTION_URL) {
      console.log(`[local-dev] Auto-completing premium narration for ${id}`);

      // Copy base audio to versioned R2 path (simulates Modal producing a new file)
      const versionedR2Key = `audio/${id}/premium-${ttsProvider ?? "free"}.mp3`;
      const baseAudio = await env.AUDIO_BUCKET.get(`audio/${id}.mp3`);
      if (baseAudio) {
        await env.AUDIO_BUCKET.put(versionedR2Key, baseAudio.body, {
          httpMetadata: { contentType: "audio/mpeg" },
        });
      }

      // Insert narration version + update best_version_id (same as webhook handler)
      const qualityRank = computeQualityRank(ttsProvider, ttsModel);
      const version = await insertNarrationVersion(env.DB, {
        paper_id: id,
        version_type: "premium",
        quality_rank: qualityRank,
        script_type: "premium",
        tts_provider: ttsProvider,
        tts_model: ttsModel,
        llm_provider: llmProvider,
        llm_model: llmModel,
        audio_r2_key: versionedR2Key,
        transcript_r2_key: null,
        duration_seconds: 600,
        actual_cost: null,
        llm_cost: null,
        tts_cost: null,
      });
      if (version) {
        await updateBestVersionId(env.DB, id, version.id);
      }

      // Mark paper as narrated with the new audio
      await updatePaperStatus(env.DB, id, "narrated", {
        audio_r2_key: versionedR2Key,
        duration_seconds: 600,
      });

      console.log(`[local-dev] Premium narration complete: ${versionedR2Key} (rank=${qualityRank})`);
      return;
    }
    try {
      const payload: Record<string, string | null> = {
        arxiv_id: id,
        tex_source_url: arxivSrcUrl(id),
        callback_url: `${baseUrl}/api/webhooks/modal`,
        paper_title: paper.title,
        paper_author: (JSON.parse(paper.authors) as string[]).join(", "),
        paper_date: paper.published_date || "",
        narration_mode: "premium",
        llm_provider: llmProvider,
        llm_api_key: llmApiKey,
        llm_model: llmModel,
        tts_provider: ttsProvider,
        tts_api_key: ttsApiKey,
        tts_model: ttsModel,
        source_preference: "tex",
        _secret: env.MODAL_WEBHOOK_SECRET,
      };
      // Use dedicated premium endpoint — derive from standard URL if not set
      const premiumUrl = env.MODAL_PREMIUM_FUNCTION_URL
        || env.MODAL_FUNCTION_URL.replace(/trigger-narration/, "trigger-premium-narration");
      const resp = await fetch(premiumUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.MODAL_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(`Modal premium dispatch failed for ${id}: ${resp.status} (was ${previousStatus}) ${body}`);
        await updatePaperStatus(env.DB, id, previousStatus);
      }
    } catch (e: any) {
      console.error(`Failed to dispatch premium for ${id} (was ${previousStatus}):`, e);
      await updatePaperStatus(env.DB, id, previousStatus);
    }
  };

  if (ctx) ctx.waitUntil(dispatch());
  else void dispatch();

  const updated = await getPaper(env.DB, id);
  return json(paperToResponse(updated!, baseUrl));
}

/** GET /api/papers/:id/estimate */
async function handleEstimate(env: Env, id: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) return json({ error: "Paper not found" }, 404);

  const rawCharCount = paper.script_char_count;
  if (!rawCharCount) {
    return json({ estimated: false, message: "Script not yet generated; estimates unavailable" });
  }

  // script_char_count reflects the base narration script. AI-enhanced scripts are
  // typically ~20% longer due to added narrations of figures, graphs, and equations.
  const charCount = Math.ceil(rawCharCount * 1.2);

  // Build options matrix: all meaningful provider/model combinations
  const options: {
    id: string;
    label: string;
    llm_provider: string;
    llm_model: string;
    tts_provider: string | null;
    tts_model: string | null;
    quality_rank: number;
    llm_cost: number;
    tts_cost: number;
    total_cost: number;
  }[] = [];

  const llmOptions = [
    { provider: "openai", model: "gpt-4o-mini",                   label: "GPT-4o Mini" },
    { provider: "openai", model: "gpt-4o",                        label: "GPT-4o" },
    { provider: "anthropic", model: "claude-3-5-haiku-20241022",  label: "Claude Haiku 3.5" },
    { provider: "anthropic", model: "claude-3-7-sonnet-20250219", label: "Claude Sonnet 3.7" },
  ];
  const ttsOptions: { provider: string | null; model: string | null; label: string }[] = [
    { provider: null,         model: null,                       label: "Free voice" },
    { provider: "openai",     model: "tts-1",                    label: "OpenAI TTS Standard" },
    { provider: "openai",     model: "tts-1-hd",                 label: "OpenAI TTS HD" },
    { provider: "elevenlabs", model: "eleven_flash_v2_5",        label: "ElevenLabs Flash" },
    { provider: "elevenlabs", model: "eleven_multilingual_v2",   label: "ElevenLabs Multilingual" },
    { provider: "google",     model: "wavenet",                  label: "Google WaveNet" },
  ];

  for (const llm of llmOptions) {
    for (const tts of ttsOptions) {
      const costs = estimateCost(llm.provider, llm.model, tts.provider, tts.model, charCount);
      const quality_rank = computeQualityRank(tts.provider, tts.model);
      options.push({
        id: `${llm.provider}/${llm.model}+${tts.provider ?? "free"}/${tts.model ?? "free"}`,
        label: `${llm.label} + ${tts.label}`,
        llm_provider: llm.provider,
        llm_model: llm.model,
        tts_provider: tts.provider,
        tts_model: tts.model,
        quality_rank,
        ...costs,
      });
    }
  }

  // Sort best quality first
  options.sort((a, b) => b.quality_rank - a.quality_rank || a.total_cost - b.total_cost);

  return json({ estimated: true, script_char_count: charCount, options });
}

/** GET /api/papers/:id/versions */
async function handleGetVersions(env: Env, id: string, baseUrl: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) return json({ error: "Paper not found" }, 404);

  const versions = await getNarrationVersions(env.DB, id);
  return json({
    versions: versions.map((v) => ({
      id: v.id,
      version_type: v.version_type,
      quality_rank: v.quality_rank,
      script_type: v.script_type,
      tts_provider: v.tts_provider,
      tts_model: v.tts_model,
      llm_provider: v.llm_provider,
      llm_model: v.llm_model,
      audio_url: v.audio_r2_key ? `${baseUrl}/api/papers/${id}/audio?version=${v.id}` : null,
      duration_seconds: v.duration_seconds,
      actual_cost: v.actual_cost,
      llm_cost: v.llm_cost,
      tts_cost: v.tts_cost,
      created_at: v.created_at,
      is_best: v.id === paper.best_version_id,
    })),
    best_version_id: paper.best_version_id,
  });
}

/** POST /api/keys/encrypt */
async function handleEncryptKey(request: Request, env: Env): Promise<Response> {
  if (!env.ENCRYPTION_KEY) {
    return json({ error: "Encryption not configured" }, 503);
  }
  let body: { key?: string; provider?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.key || typeof body.key !== "string") {
    return json({ error: "key is required" }, 400);
  }
  if (!body.provider || typeof body.provider !== "string") {
    return json({ error: "provider is required" }, 400);
  }
  const validProviders = ["openai", "anthropic", "elevenlabs", "google"];
  if (!validProviders.includes(body.provider)) {
    return json({ error: `provider must be one of: ${validProviders.join(", ")}` }, 400);
  }
  const aesKey = await deriveAesKey(env.ENCRYPTION_KEY);
  const ciphertext = await aesEncrypt(body.key, aesKey);
  return json({ encrypted_key: ciphertext, provider: body.provider });
}

/** POST /api/keys/validate */
async function handleValidateKey(request: Request, env: Env): Promise<Response> {
  if (!env.ENCRYPTION_KEY) {
    return json({ error: "Encryption not configured" }, 503);
  }
  let body: { encrypted_key?: string; provider?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.encrypted_key || typeof body.encrypted_key !== "string") {
    return json({ error: "encrypted_key is required" }, 400);
  }
  if (!body.provider || typeof body.provider !== "string") {
    return json({ error: "provider is required" }, 400);
  }

  let rawKey: string;
  try {
    const aesKey = await deriveAesKey(env.ENCRYPTION_KEY);
    rawKey = await aesDecrypt(body.encrypted_key, aesKey);
  } catch {
    return json({ valid: false, error: "Failed to decrypt — key may be corrupted" }, 400);
  }

  const result = await validateProviderKey(body.provider, rawKey);
  // Never include the raw key in the response
  return json({ valid: result.valid, info: result.info, error: result.error });
}

async function handleArxivSearch(url: URL): Promise<Response> {
  const query = url.searchParams.get("q") || "";
  if (!query.trim()) {
    return json({ papers: [], total: 0, page: 1, per_page: 10 });
  }
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("per_page") || "10")));
  const start = (page - 1) * perPage;

  try {
    const result = await searchArxiv(query, start, perPage);
    return json({ papers: result.papers, total: result.total, page, per_page: perPage });
  } catch (e: any) {
    return json({ error: e.message }, 502);
  }
}

// ─── Route Table ─────────────────────────────────────────────────────────────

type RouteHandler = (
  request: Request,
  env: Env,
  url: URL,
  matches: RegExpMatchArray,
  ctx?: ExecutionContext
) => Promise<Response>;

interface RouteEntry {
  method: string | null; // null = any method (for multi-method handlers like rating)
  pattern: RegExp;
  handler: RouteHandler;
}

function buildRouteTable(baseUrl: string): RouteEntry[] {
  return [
    // Static paths — listed before regex patterns to preserve priority
    {
      method: "POST",
      pattern: /^\/api\/papers\/preview$/,
      handler: (req) => handlePreviewPaper(req),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/batch$/,
      handler: (req, env) => handleBatchPapers(req, env, baseUrl),
    },
    {
      method: "GET",
      pattern: /^\/api\/arxiv\/search$/,
      handler: (_req, _env, url) => handleArxivSearch(url),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers$/,
      handler: (req, env, url) => handleListPapers(env, url, baseUrl),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers$/,
      handler: (req, env) => handleSubmitPaper(req, env, baseUrl),
    },
    {
      method: "GET",
      pattern: /^\/api\/narration-check$/,
      handler: (req, env) => handleNarrationCheck(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/my-additions$/,
      handler: (req, env) => handleMyAdditions(req, env, baseUrl),
    },
    {
      method: "POST",
      pattern: /^\/api\/admin\/verify$/,
      handler: (req, env) => handleAdminVerify(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/stats$/,
      handler: (req, env) => handleAdminStats(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/papers-with-ratings$/,
      handler: (req, env) => handleAdminPapersWithRatings(req, env, baseUrl),
    },
    {
      method: "POST",
      pattern: /^\/api\/admin\/clear-ratings$/,
      handler: (req, env) => handleAdminClearRatings(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/has-low-ratings$/,
      handler: (req, env) => handleAdminHasLowRatings(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/lists$/,
      handler: (req, env) => handleAdminLists(req, env),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/admin\/papers\/([\w.-]+)\/premium-versions$/,
      handler: (req, env, _url, m) => handleDeletePremiumVersions(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/lists$/,
      handler: (req, env) => handleCreateList(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/my-lists$/,
      handler: (req, env) => handleMyLists(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/playlist$/,
      handler: (req, env) => handleGetPlaylist(req, env),
    },
    {
      method: "PUT",
      pattern: /^\/api\/playlist$/,
      handler: (req, env) => handleUpdatePlaylist(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/playlist$/,
      handler: (req, env) => handleAddToPlaylist(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/listen-history$/,
      handler: (req, env) => handleGetListenHistory(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/merge-tokens$/,
      handler: (req, env) => handleMergeTokens(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/playback-positions$/,
      handler: (req, env) => handleGetPositions(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/webhooks\/modal$/,
      handler: (req, env) => handleModalWebhook(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/keys\/encrypt$/,
      handler: (req, env) => handleEncryptKey(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/keys\/validate$/,
      handler: (req, env) => handleValidateKey(req, env),
    },
    // Regex patterns with capture groups
    // Paper IDs use (.+?) to support old-style arXiv IDs with slashes (e.g. astro-ph/9905136)
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/audio$/,
      handler: (_req, env, url, m) => handleGetAudio(env, m[1], url),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/transcript$/,
      handler: (_req, env, url, m) => handleGetTranscript(env, m[1], url),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/progress$/,
      handler: (_req, env, _url, m) => handleGetProgress(env, m[1], baseUrl),
    },
    {
      method: null, // GET, POST, DELETE
      pattern: /^\/api\/papers\/(.+?)\/rating$/,
      handler: (req, env, _url, m) => handleRating(req, env, m[1]),
    },
    {
      method: "PUT",
      pattern: /^\/api\/papers\/([^/]+)\/position$/,
      handler: (req, env, _url, m) => handleSavePosition(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/playlist\/([^/]+)$/,
      handler: (req, env, _url, m) => handleRemoveFromPlaylist(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/([^/]+)\/listened$/,
      handler: (req, env, _url, m) => handleMarkListened(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/papers\/([^/]+)\/listened$/,
      handler: (req, env, _url, m) => handleUnmarkListened(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/(.+?)\/visit$/,
      handler: (req, env, _url, m) => handleRecordVisit(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/(.+?)\/narrate$/,
      handler: (req, env, _url, m, ctx) => handleNarratePaper(req, env, m[1], baseUrl, ctx),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/(.+?)\/narrate-premium$/,
      handler: (req, env, _url, m, ctx) => handleNarratePremium(req, env, m[1], baseUrl, ctx),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/estimate$/,
      handler: (_req, env, _url, m) => handleEstimate(env, m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/versions$/,
      handler: (_req, env, _url, m) => handleGetVersions(env, m[1], baseUrl),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/(.+?)\/reprocess$/,
      handler: (req, env, _url, m, ctx) => handleReprocessPaper(req, env, m[1], baseUrl, ctx),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/my-additions\/(.+)$/,
      handler: (req, env, _url, m) => handleDeleteMyAddition(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/papers\/(.+)$/,
      handler: (req, env, _url, m) => handleDeletePaper(req, env, m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+)$/,
      handler: (_req, env, _url, m) => handleGetPaper(env, m[1], baseUrl),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/papers\/(.+?)\/ratings$/,
      handler: (req, env, _url, m) => handleAdminPaperRatings(req, env, m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/lists\/recent$/,
      handler: (_req, env, url) => handleRecentLists(env, url),
    },
    {
      method: "GET",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})$`),
      handler: (req, env, _url, m) => handleGetList(req, env, m[1], baseUrl),
    },
    {
      method: "PUT",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})$`),
      handler: (req, env, _url, m) => handleUpdateList(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})$`),
      handler: (req, env, _url, m) => handleDeleteList(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})\\/items$`),
      handler: (req, env, _url, m) => handleAddListItems(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})\\/items\\/([^/]+)$`),
      handler: (req, env, _url, m) => handleRemoveListItem(req, env, m[1], m[2]),
    },
    {
      method: "PUT",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})\\/reorder$`),
      handler: (req, env, _url, m) => handleReorderList(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})\\/import$`),
      handler: (req, env, _url, m) => handleImportList(req, env, m[1], baseUrl),
    },
  ];
}

async function handleRequest(
  request: Request,
  env: Env,
  url: URL,
  path: string,
  method: string,
  ctx?: ExecutionContext
): Promise<Response> {
  const baseUrl = url.origin;
  const routes = buildRouteTable(baseUrl);

  for (const route of routes) {
    if (route.method !== null && route.method !== method) continue;
    const m = path.match(route.pattern);
    if (m) {
      return route.handler(request, env, url, m, ctx);
    }
  }

  return json({ error: "Not found" }, 404);
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

async function handleListPapers(env: Env, url: URL, baseUrl: string): Promise<Response> {
  const query = url.searchParams.get("q") || "";
  const sort = url.searchParams.get("sort") || "popular";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("per_page") || "20")));
  const offset = (page - 1) * perPage;

  let papers: Paper[];

  if (query) {
    // Check if it's an arXiv URL/ID
    const arxivId = parseArxivId(query);
    if (arxivId) {
      const paper = await getPaper(env.DB, arxivId);
      papers = paper ? [paper] : [];
    } else {
      papers = await searchPapers(env.DB, query, perPage, offset);
    }
  } else if (sort === "recent") {
    const status = url.searchParams.get("status") || undefined;
    papers = await getRecentPapers(env.DB, perPage, offset, status);
  } else if (sort === "all") {
    papers = await getAllPapers(env.DB, perPage, offset);
  } else {
    const popular = await getPopularPapers(env.DB, perPage, offset);
    papers = popular;
  }

  return json({
    papers: papers.map((p) => paperToResponse(p, baseUrl)),
    page,
    per_page: perPage,
  });
}

async function handleGetPaper(env: Env, id: string, baseUrl: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) {
    return json({ error: "Paper not found" }, 404);
  }
  return json(paperToResponse(paper, baseUrl));
}

async function handlePreviewPaper(request: Request): Promise<Response> {
  const body = await request.json<{ arxiv_url?: string }>();

  if (!body.arxiv_url) {
    return json({ error: "arxiv_url is required" }, 400);
  }

  const arxivId = parseArxivId(body.arxiv_url);
  if (!arxivId) {
    return json({ error: "Invalid arXiv URL or ID" }, 400);
  }

  try {
    const metadata = await scrapeArxivMetadata(arxivId);
    return json({
      id: metadata.id,
      arxiv_url: metadata.arxiv_url,
      title: metadata.title,
      authors: metadata.authors,
      abstract: metadata.abstract,
      published_date: metadata.published_date,
      tex_source_url: metadata.tex_source_url,
    });
  } catch (e: any) {
    return json({ error: e.message }, 422);
  }
}

async function handleSubmitPaper(
  request: Request,
  env: Env,
  baseUrl: string
): Promise<Response> {
  const body = await request.json<{
    arxiv_url?: string;
    metadata?: {
      id: string;
      arxiv_url: string;
      title: string;
      authors: string[];
      abstract: string;
      published_date: string;
      tex_source_url: string;
    };
  }>();

  if (!body.arxiv_url) {
    return json({ error: "arxiv_url is required" }, 400);
  }

  const arxivId = parseArxivId(body.arxiv_url);
  if (!arxivId) {
    return json({ error: "Invalid arXiv URL or ID" }, 400);
  }

  // Check if we already have this paper
  const existing = await getPaper(env.DB, arxivId);
  if (existing) {
    return json(paperToResponse(existing, baseUrl));
  }

  // Rate limit: 240 paper submissions per IP per day (admin bypasses).
  // Uses IP (not token) — consistent with narration limits; tokens are
  // client-generated and trivially regenerated to evade limits.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const isAdmin = request.headers.get("X-Admin-Password") === env.ADMIN_PASSWORD && !!env.ADMIN_PASSWORD;
  if (!isAdmin) {
    const limit = parseInt(env.PAPER_SUBMISSION_DAILY_LIMIT || "240");
    const submissionsToday = await env.DB
      .prepare("SELECT COUNT(*) as cnt FROM papers WHERE submitted_by_ip = ? AND created_at > datetime('now', '-1 day')")
      .bind(ip)
      .first<{ cnt: number }>();
    if ((submissionsToday?.cnt ?? 0) >= limit) {
      return json({ error: "Daily paper submission limit reached. Try again tomorrow." }, 429);
    }
  }

  // --- Use pre-scraped metadata if provided, otherwise scrape ---
  let metadata;
  if (body.metadata && body.metadata.id === arxivId) {
    // Validate length limits on user-supplied metadata to prevent content injection.
    const t = body.metadata.title || "";
    const ab = body.metadata.abstract || "";
    const authors = body.metadata.authors;
    if (t.length > 500 || ab.length > 5000 || !Array.isArray(authors) || authors.length > 200) {
      return json({ error: "Metadata fields exceed allowed length" }, 400);
    }
    metadata = body.metadata;
  } else {
    try {
      metadata = await scrapeArxivMetadata(arxivId);
    } catch (e: any) {
      return json({ error: e.message }, 422);
    }
  }

  // --- Insert paper with status "unnarrated" ---
  const userToken = request.headers.get("X-User-Token") || undefined;
  const cf = (request as Request<unknown, IncomingRequestCfProperties>).cf;
  const inserted = await insertPaper(env.DB, {
    id: metadata.id,
    arxiv_url: metadata.arxiv_url,
    title: metadata.title,
    authors: metadata.authors,
    abstract: metadata.abstract,
    published_date: metadata.published_date,
    submitted_by_ip: ip,
    submitted_by_token: userToken,
    submitted_by_country: cf?.country || undefined,
    submitted_by_city: cf?.city || undefined,
  });

  if (!inserted) {
    // Race condition: another request inserted it
    const paper = await getPaper(env.DB, arxivId);
    return json(paperToResponse(paper!, baseUrl));
  }

  const paper = await getPaper(env.DB, arxivId);
  return json(paperToResponse(paper!, baseUrl), 201);
}

async function handleNarratePaper(
  request: Request,
  env: Env,
  id: string,
  baseUrl: string,
  ctx?: ExecutionContext
): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) {
    return json({ error: "Paper not found" }, 404);
  }

  // Atomic claim: only one caller wins the race from unnarrated/failed → narrating.
  // Everyone else gets a success response with the current paper state (already in progress).
  const claimed = await claimPaperForNarration(env.DB, id);

  if (claimed) {
    // We won the race — do rate limit check and record submission
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const isAdmin = request.headers.get("X-Admin-Password") === env.ADMIN_PASSWORD && !!env.ADMIN_PASSWORD;
    if (!isAdmin) {
      const limit = parseInt(env.PER_IP_DAILY_LIMIT || "24");
      const count = await getSubmissionCount(env.DB, ip);
      if (count >= limit) {
        // Revert the claim — they're over limit
        await updatePaperStatus(env.DB, id, "unnarrated");
        return json({ error: "Daily narration limit reached. Try again tomorrow." }, 429);
      }
    }
    await recordSubmission(env.DB, ip);

    // Dispatch to Modal after responding
    const dispatch = getPaper(env.DB, id).then((p) => {
      if (p && p.status === "narrating") {
        return dispatchToModal(env, p, "https://api.unarxiv.org");
      }
    });
    if (ctx) ctx.waitUntil(dispatch);
    else void dispatch;
  }

  // Return current state — whether we claimed it or someone else already did
  const updated = await getPaper(env.DB, id);
  return json(paperToResponse(updated!, baseUrl));
}

/**
 * Dispatch a single paper to Modal for narration. Paper should already be in "narrating" status.
 * On failure, reverts to "unnarrated" so the user can retry.
 */
async function dispatchToModal(
  env: Env,
  paper: Paper,
  baseUrl: string,
  sourcePriority: string = "latex"
): Promise<void> {
  // Local dev: skip dispatch, log curl command to simulate completion
  if (!env.MODAL_WEBHOOK_SECRET) {
    console.log(`[local-dev] Skipping Modal dispatch for ${paper.id} (no MODAL_WEBHOOK_SECRET). ` +
      `Simulate completion: curl -X POST http://localhost:8787/api/webhooks/modal ` +
      `-H 'Content-Type: application/json' ` +
      `-d '{"arxiv_id":"${paper.id}","status":"narrated","duration_seconds":600}'`);
    return;
  }
  if (!env.MODAL_FUNCTION_URL) return;

  try {
    const resp = await fetch(env.MODAL_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MODAL_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        arxiv_id: paper.id,
        tex_source_url: arxivSrcUrl(paper.id),
        callback_url: `${baseUrl}/api/webhooks/modal`,
        paper_title: paper.title,
        paper_author: (JSON.parse(paper.authors) as string[]).join(", "),
        paper_date: paper.published_date || "",
        source_priority: sourcePriority,
        _secret: env.MODAL_WEBHOOK_SECRET,
      }),
    });
    if (!resp.ok) {
      console.error(`Modal returned ${resp.status} for ${paper.id}: ${await resp.text().catch(() => "")}`);
      await updatePaperStatus(env.DB, paper.id, "unnarrated");
    }
  } catch (e: any) {
    console.error(`Failed to dispatch ${paper.id} to Modal:`, e);
    await updatePaperStatus(env.DB, paper.id, "unnarrated");
  }
}

/**
 * Cron safety net: re-dispatch papers stuck in "narrating" for over 20 minutes.
 * This handles cases where Modal never called back (crash, timeout, network error).
 */
async function recoverStalePapers(env: Env): Promise<void> {
  if (!env.MODAL_FUNCTION_URL) return;

  const baseUrl = "https://api.unarxiv.org";

  try {
    const stuck = await env.DB.prepare(
      `SELECT * FROM papers WHERE status = 'narrating'
       AND updated_at < datetime('now', '-20 minutes')`
    ).all<Paper>();

    for (const paper of stuck.results) {
      console.log(`Recovering stale paper: ${paper.id}`);
      await updatePaperStatus(env.DB, paper.id, "narrating", { eta_seconds: null });
      await dispatchToModal(env, paper, baseUrl);
    }
  } catch (e: any) {
    console.error("Failed to recover stale papers:", e);
  }
}

async function handleNarrationCheck(
  request: Request,
  env: Env
): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  // Turnstile captcha disabled for now
  return json({ captcha_required: false });
}

async function handleReprocessPaper(
  request: Request,
  env: Env,
  id: string,
  baseUrl: string,
  ctx?: ExecutionContext
): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;

  // Parse body: mode ("full" | "script_only" | "narration_only"), wipe_reviews, source_priority
  let wipeReviews = false;
  let mode = "full";
  let sourcePriority = "latex";
  try {
    const body = await request.json<{ wipe_reviews?: boolean; mode?: string; source_priority?: string }>();
    wipeReviews = !!body?.wipe_reviews;
    if (body?.mode && ["full", "script_only", "narration_only"].includes(body.mode)) {
      mode = body.mode;
    }
    if (body?.source_priority === "pdf") sourcePriority = "pdf";
  } catch {
    // No body or invalid JSON is fine
  }

  const paper = await getPaper(env.DB, id);
  if (!paper) {
    return json({ error: "Paper not found" }, 404);
  }

  // Delete old media from R2 based on mode
  if (mode !== "narration_only") {
    // Delete old transcript (will be regenerated)
    try { await env.AUDIO_BUCKET.delete(`transcripts/${id}.txt`); } catch {}
  }
  if (mode !== "script_only") {
    // Delete old audio (will be regenerated)
    if (paper.audio_r2_key) {
      try { await env.AUDIO_BUCKET.delete(paper.audio_r2_key); } catch {}
    }
  }

  // Wipe reviews if requested
  if (wipeReviews) {
    await clearRatingsForPaper(env.DB, id);
  }

  // Re-scrape metadata (needed for tex_source_url in full/script_only modes)
  let metadata;
  if (mode !== "narration_only") {
    try {
      metadata = await scrapeArxivMetadata(id);
    } catch (e: any) {
      return json({ error: e.message }, 422);
    }

    // Reset paper in DB with fresh metadata
    await resetPaperForReprocess(env.DB, id, {
      title: metadata.title,
      authors: metadata.authors,
      abstract: metadata.abstract,
      published_date: metadata.published_date,
    });
  } else {
    // narration_only: just reset audio fields, keep transcript and metadata
    await resetPaperForReprocess(env.DB, id, {
      title: paper.title,
      authors: JSON.parse(paper.authors),
      abstract: paper.abstract,
      published_date: paper.published_date,
    });
  }

  // Dispatch to Modal
  if (env.MODAL_FUNCTION_URL) {
    try {
      await fetch(env.MODAL_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.MODAL_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify({
          arxiv_id: id,
          tex_source_url: metadata?.tex_source_url || "",
          callback_url: `${baseUrl}/api/webhooks/modal`,
          paper_title: metadata?.title || paper.title,
          paper_author: (metadata?.authors || []).join(", "),
          paper_date: metadata?.published_date || paper.published_date || "",
          mode,
          source_priority: sourcePriority,
          _secret: env.MODAL_WEBHOOK_SECRET,
        }),
      });
    } catch (e: any) {
      console.error("Failed to dispatch to Modal:", e);
    }
  }

  const updated = await getPaper(env.DB, id);
  return json(paperToResponse(updated!, baseUrl));
}

async function handleDeletePaper(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;

  // Delete audio from R2 if exists
  const paper = await getPaper(env.DB, id);
  if (!paper) {
    return json({ error: "Paper not found" }, 404);
  }

  if (paper.audio_r2_key) {
    try {
      await env.AUDIO_BUCKET.delete(paper.audio_r2_key);
    } catch (e) {
      console.error("Failed to delete R2 object:", e);
    }
  }

  await deletePaper(env.DB, id);
  return json({ ok: true });
}

async function handleGetAudio(env: Env, id: string, url: URL): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper || paper.status !== "narrated" || !paper.audio_r2_key) {
    return json({ error: "Audio not available" }, 404);
  }

  // Support ?version=<id> for serving specific narration versions
  let r2Key = paper.audio_r2_key;
  const versionParam = url.searchParams.get("version");
  if (versionParam) {
    const versionId = parseInt(versionParam, 10);
    if (!isNaN(versionId)) {
      const version = await getVersionById(env.DB, versionId, id);
      if (version?.audio_r2_key) {
        r2Key = version.audio_r2_key;
      }
    }
  }

  const object = await env.AUDIO_BUCKET.get(r2Key);
  if (!object) {
    return json({ error: "Audio file not found" }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", "audio/mpeg");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(object.size));
  headers.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(paper.title)}.mp3"`
  );
  // Cache for 1 day
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(object.body, { headers });
}

async function handleGetTranscript(env: Env, id: string, url: URL): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper || !["narrating", "narrated"].includes(paper.status)) {
    return json({ error: "Transcript not available" }, 404);
  }

  // Support ?version=<id> for version-specific transcripts
  let r2Key = `transcripts/${id}.txt`;
  const versionParam = url.searchParams.get("version");
  if (versionParam) {
    const versionId = parseInt(versionParam, 10);
    if (!isNaN(versionId)) {
      const version = await getVersionById(env.DB, versionId, id);
      if (version?.transcript_r2_key) {
        r2Key = version.transcript_r2_key;
      }
    }
  }

  const object = await env.AUDIO_BUCKET.get(r2Key);
  if (!object) {
    return json({ error: "Transcript file not found" }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Content-Length", String(object.size));
  headers.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(paper.title)} - Transcript.txt"`
  );
  if (object.uploaded) {
    headers.set("Last-Modified", object.uploaded.toUTCString());
  }

  return new Response(object.body, { headers });
}

async function handleGetProgress(env: Env, id: string, baseUrl: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) {
    return json({ error: "Paper not found" }, 404);
  }
  return json(paperToResponse(paper, baseUrl));
}

async function handleRecordVisit(request: Request, env: Env, id: string): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const token = request.headers.get("X-User-Token") || null;
  await recordVisit(env.DB, id, ip, token);
  return json({ ok: true });
}

// "Modal" here refers to Modal.com (the serverless Python platform), not a UI dialog.
async function handleModalWebhook(request: Request, env: Env): Promise<Response> {
  // Verify webhook secret — reject if secret not configured or header doesn't match
  const authHeader = request.headers.get("Authorization");
  if (!env.MODAL_WEBHOOK_SECRET || authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json<{
    arxiv_id: string;
    status: string;
    progress_detail?: string;
    error_message?: string;
    eta_seconds?: number;
    audio_r2_key?: string;
    audio_size_bytes?: number;
    duration_seconds?: number;
    // Premium narration fields
    narration_mode?: "free" | "premium";
    version_type?: "free" | "premium";
    script_type?: "free" | "premium";
    tts_provider?: string;
    tts_model?: string;
    llm_provider?: string;
    llm_model?: string;
    transcript_r2_key?: string;
    script_r2_key?: string; // Modal sends this instead of transcript_r2_key
    actual_cost?: number;
    llm_cost?: number;
    tts_cost?: number;
    script_char_count?: number;
    // Modal sends nested objects for premium narration callbacks
    providers?: { llm?: string; llm_model?: string; tts?: string; tts_voice?: string };
    costs?: { llm_cost_usd?: number; tts_cost_usd?: number; total_cost_usd?: number };
    quality_rank?: number;
    version_id?: string;
  }>();

  if (!body.arxiv_id || !body.status) {
    return json({ error: "arxiv_id and status required" }, 400);
  }

  // Flatten nested provider/cost objects from Modal's premium callbacks
  if (body.providers) {
    if (!body.tts_provider && body.providers.tts) body.tts_provider = body.providers.tts;
    if (!body.tts_model && body.providers.tts_voice) body.tts_model = body.providers.tts_voice;
    if (!body.llm_provider && body.providers.llm) body.llm_provider = body.providers.llm;
    if (!body.llm_model && body.providers.llm_model) body.llm_model = body.providers.llm_model;
  }
  if (body.costs) {
    if (body.actual_cost == null && body.costs.total_cost_usd != null) body.actual_cost = body.costs.total_cost_usd;
    if (body.llm_cost == null && body.costs.llm_cost_usd != null) body.llm_cost = body.costs.llm_cost_usd;
    if (body.tts_cost == null && body.costs.tts_cost_usd != null) body.tts_cost = body.costs.tts_cost_usd;
  }
  // Modal sends script_r2_key; we use transcript_r2_key
  if (!body.transcript_r2_key && body.script_r2_key) {
    body.transcript_r2_key = body.script_r2_key;
  }
  // If Modal sent a quality_rank and version metadata, it's a premium narration
  if (body.quality_rank != null && body.quality_rank > 0 && !body.version_type) {
    body.version_type = "premium";
    body.narration_mode = "premium";
  }

  const VALID_STATUSES: PaperStatus[] = ["unnarrated", "narrating", "narrated", "failed"];
  if (!VALID_STATUSES.includes(body.status as PaperStatus)) {
    return json({ error: "Invalid status" }, 400);
  }

  // Validate audio_r2_key format to prevent path confusion in R2 lookups
  if (body.audio_r2_key !== undefined && !/^audio\/[\w.\/-]+\.mp3$/.test(body.audio_r2_key)) {
    return json({ error: "Invalid audio_r2_key format" }, 400);
  }

  // Update script_char_count if provided (from script generation phase)
  if (body.script_char_count != null && body.script_char_count > 0) {
    await updateScriptCharCount(env.DB, body.arxiv_id, body.script_char_count);
  }

  await updatePaperStatus(env.DB, body.arxiv_id, body.status as PaperStatus, {
    progress_detail: body.progress_detail,
    error_message: body.error_message,
    eta_seconds: body.eta_seconds,
    audio_r2_key: body.audio_r2_key,
    audio_size_bytes: body.audio_size_bytes,
    duration_seconds: body.duration_seconds,
  });

  // On completion, record a narration_version and update best_version_id
  if (body.status === "narrated" && body.audio_r2_key) {
    const versionType = body.version_type ?? (body.narration_mode === "premium" ? "premium" : "free");
    const scriptType = body.script_type ?? (body.narration_mode === "premium" ? "premium" : "free");
    const ttsProvider = body.tts_provider ?? (versionType === "free" ? "openai" : null);
    const ttsModel = body.tts_model ?? (versionType === "free" ? "tts-1" : null);
    const qualityRank = versionType === "free" ? 0 : computeQualityRank(ttsProvider, ttsModel);

    const version = await insertNarrationVersion(env.DB, {
      paper_id: body.arxiv_id,
      version_type: versionType,
      quality_rank: qualityRank,
      script_type: scriptType,
      tts_provider: ttsProvider,
      tts_model: ttsModel,
      llm_provider: body.llm_provider ?? null,
      llm_model: body.llm_model ?? null,
      audio_r2_key: body.audio_r2_key,
      transcript_r2_key: body.transcript_r2_key ?? null,
      duration_seconds: body.duration_seconds ?? null,
      actual_cost: body.actual_cost ?? null,
      llm_cost: body.llm_cost ?? null,
      tts_cost: body.tts_cost ?? null,
    });

    // Atomically upgrade best_version_id if this version is better
    await updateBestVersionId(env.DB, body.arxiv_id, version.id);
  }

  return json({ ok: true });
}

// ─── Admin: delete premium versions (test cleanup) ─────────────────────────

async function handleDeletePremiumVersions(request: Request, env: Env, paperId: string): Promise<Response> {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  await env.DB.prepare("DELETE FROM narration_versions WHERE paper_id = ? AND quality_rank > 0")
    .bind(paperId)
    .run();
  // Reset best_version_id and restore original audio R2 key
  await env.DB.prepare("UPDATE papers SET best_version_id = NULL, audio_r2_key = ? WHERE id = ?")
    .bind(`audio/${paperId}.mp3`, paperId)
    .run();

  return json({ ok: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return a 401 Response if the request does not supply the correct admin password, else null. */
function requireAdmin(request: Request, env: Env): Response | null {
  const password = request.headers.get("X-Admin-Password");
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}


function json(data: any, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}
