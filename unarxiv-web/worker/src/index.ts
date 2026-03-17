/**
 * unarXiv API — Cloudflare Worker
 *
 * Routes:
 *   GET  /api/papers?q=...&sort=popular|recent|all&page=1
 *   GET  /api/papers/:id
 *   POST /api/papers/preview  { arxiv_url }  — scrape metadata without inserting
 *   POST /api/papers  { arxiv_url, metadata? }  — create paper record (no narration)
 *   POST /api/papers/:id/narrate  — request narration (conditional captcha)
 *   GET  /api/narration-check  — check if captcha is required for caller
 *   GET  /api/my-additions  — papers submitted by caller's IP
 *   DELETE /api/papers/:id  (requires admin password)
 *   GET  /api/papers/:id/audio
 *   GET  /api/papers/:id/progress
 *   POST /api/papers/:id/visit
 *   POST /api/webhooks/modal  (callback from Modal worker)
 */

import type { Env, Paper } from "./types";
import { paperToResponse } from "./types";
import { parseArxivId, scrapeArxivMetadata } from "./arxiv";
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
  getGlobalSubmissionCount,
  getNarrationCountLastHour,
  recordSubmission,
  cleanup,
  getRating,
  upsertRating,
  deleteRatingForIp,
  getAllPapersWithRatings,
  hasAnyLowRatings,
  getAllRatingsForPaper,
  clearRatingsForPaper,
  getPapersBySubmitterIp,
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
} from "./db";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = ["https://unarxiv.org", "http://localhost:3000"];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : "https://unarxiv.org";
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password, X-List-Token",
    };

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const response = await handleRequest(request, env, url, path, method);
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

  // Scheduled cleanup of old visits/submissions (configure in wrangler.toml)
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await cleanup(env.DB);
  },
};

async function handleRequest(
  request: Request,
  env: Env,
  url: URL,
  path: string,
  method: string
): Promise<Response> {
  const baseUrl = url.origin;

  // POST /api/papers/preview — must be before /api/papers/:id match
  if (path === "/api/papers/preview" && method === "POST") {
    return handlePreviewPaper(request);
  }

  // POST /api/papers/batch — fetch multiple papers by ID
  if (path === "/api/papers/batch" && method === "POST") {
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

  // GET /api/papers
  if (path === "/api/papers" && method === "GET") {
    return handleListPapers(env, url, baseUrl);
  }

  // POST /api/papers
  if (path === "/api/papers" && method === "POST") {
    return handleSubmitPaper(request, env, baseUrl);
  }

  // GET /api/papers/:id/audio
  const audioMatch = path.match(/^\/api\/papers\/([^/]+)\/audio$/);
  if (audioMatch && method === "GET") {
    return handleGetAudio(env, audioMatch[1]);
  }

  // GET /api/papers/:id/transcript
  const transcriptMatch = path.match(/^\/api\/papers\/([^/]+)\/transcript$/);
  if (transcriptMatch && method === "GET") {
    return handleGetTranscript(env, transcriptMatch[1]);
  }

  // GET /api/papers/:id/progress
  const progressMatch = path.match(/^\/api\/papers\/([^/]+)\/progress$/);
  if (progressMatch && method === "GET") {
    return handleGetProgress(env, progressMatch[1], baseUrl);
  }

  // GET /api/papers/:id/rating — get caller's rating
  const ratingGetMatch = path.match(/^\/api\/papers\/([^/]+)\/rating$/);
  if (ratingGetMatch && method === "GET") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rating = await getRating(env.DB, ratingGetMatch[1], ip);
    if (!rating) return json({ rating: null });
    return json({
      paper_id: rating.paper_id,
      stars: rating.stars,
      comment: rating.comment,
      created_at: rating.created_at,
      updated_at: rating.updated_at,
    });
  }

  // POST /api/papers/:id/rating — submit or update rating
  const ratingPostMatch = path.match(/^\/api\/papers\/([^/]+)\/rating$/);
  if (ratingPostMatch && method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const body = await request.json<{ stars?: number; comment?: string }>();
    const stars = body.stars;
    if (!stars || stars < 1 || stars > 5) {
      return json({ error: "stars must be 1-5" }, 400);
    }
    const rating = await upsertRating(env.DB, ratingPostMatch[1], ip, stars, body.comment || "");
    return json({
      paper_id: rating.paper_id,
      stars: rating.stars,
      comment: rating.comment,
      created_at: rating.created_at,
      updated_at: rating.updated_at,
    });
  }

  // DELETE /api/papers/:id/rating — delete caller's rating
  const ratingDeleteMatch = path.match(/^\/api\/papers\/([^/]+)\/rating$/);
  if (ratingDeleteMatch && method === "DELETE") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    await deleteRatingForIp(env.DB, ratingDeleteMatch[1], ip);
    return json({ ok: true });
  }

  // POST /api/papers/:id/visit
  const visitMatch = path.match(/^\/api\/papers\/([^/]+)\/visit$/);
  if (visitMatch && method === "POST") {
    return handleRecordVisit(request, env, visitMatch[1]);
  }

  // DELETE /api/papers/:id
  const deleteMatch = path.match(/^\/api\/papers\/([^/]+)$/);
  if (deleteMatch && method === "DELETE") {
    return handleDeletePaper(request, env, deleteMatch[1]);
  }

  // GET /api/papers/:id
  const paperMatch = path.match(/^\/api\/papers\/([^/]+)$/);
  if (paperMatch && method === "GET") {
    return handleGetPaper(env, paperMatch[1], baseUrl);
  }

  // POST /api/papers/:id/narrate — request voice narration
  const narrateMatch = path.match(/^\/api\/papers\/([^/]+)\/narrate$/);
  if (narrateMatch && method === "POST") {
    return handleNarratePaper(request, env, narrateMatch[1], baseUrl);
  }

  // GET /api/narration-check — check if captcha is required for caller
  if (path === "/api/narration-check" && method === "GET") {
    return handleNarrationCheck(request, env);
  }

  // GET /api/my-additions — papers submitted by this caller's IP
  if (path === "/api/my-additions" && method === "GET") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const papers = await getPapersBySubmitterIp(env.DB, ip);
    return json({ papers: papers.map((p) => paperToResponse(p, baseUrl)) });
  }

  // DELETE /api/my-additions/:id — delete own paper (IP must match submitter)
  const myDeleteMatch = path.match(/^\/api\/my-additions\/([^/]+)$/);
  if (myDeleteMatch && method === "DELETE") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const paper = await getPaper(env.DB, myDeleteMatch[1]);
    if (!paper) return json({ error: "Paper not found" }, 404);
    if (paper.submitted_by_ip !== ip) return json({ error: "Not your paper" }, 403);
    if (paper.audio_r2_key) {
      try { await env.AUDIO_BUCKET.delete(paper.audio_r2_key); } catch {}
    }
    await deletePaper(env.DB, myDeleteMatch[1]);
    return json({ ok: true });
  }

  // POST /api/papers/:id/reprocess
  const reprocessMatch = path.match(/^\/api\/papers\/([^/]+)\/reprocess$/);
  if (reprocessMatch && method === "POST") {
    return handleReprocessPaper(request, env, reprocessMatch[1], baseUrl);
  }

  // POST /api/admin/verify
  if (path === "/api/admin/verify" && method === "POST") {
    const password = request.headers.get("X-Admin-Password");
    if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
      return json({ error: "Invalid password" }, 401);
    }
    return json({ ok: true });
  }

  // GET /api/admin/stats
  if (path === "/api/admin/stats" && method === "GET") {
    const password = request.headers.get("X-Admin-Password");
    if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
      return json({ error: "Unauthorized" }, 401);
    }
    const raw = await getTopContributors(env.DB, 10);
    const callerIp = request.headers.get("CF-Connecting-IP") || "";
    const names = ["Alice", "Bob", "Charlie", "Dana", "Eli", "Faye", "Gus", "Hana", "Ivan", "Jia",
                   "Kai", "Luna", "Max", "Nora", "Omar", "Pia", "Quinn", "Ravi", "Sara", "Teo"];
    const contributors = raw.map((c, i) => ({
      name: c.ip === callerIp ? "You" : names[i] || `User ${i + 1}`,
      location: [c.city, c.country].filter(Boolean).join(", ") || "Unknown",
      paper_count: c.paper_count,
      is_you: c.ip === callerIp,
    }));
    // Also return which paper IDs belong to the caller
    const yourPaperIds = raw
      .find((c) => c.ip === callerIp)
      ? (await env.DB.prepare("SELECT id FROM papers WHERE submitted_by_ip = ?").bind(callerIp).all<{ id: string }>()).results.map((r) => r.id)
      : [];
    return json({ contributors, your_paper_ids: yourPaperIds });
  }

  // GET /api/admin/papers-with-ratings — curate page data
  if (path === "/api/admin/papers-with-ratings" && method === "GET") {
    const password = request.headers.get("X-Admin-Password");
    if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
      return json({ error: "Unauthorized" }, 401);
    }
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

  // GET /api/admin/papers/:id/ratings — all ratings for a paper
  const adminRatingsMatch = path.match(/^\/api\/admin\/papers\/([^/]+)\/ratings$/);
  if (adminRatingsMatch && method === "GET") {
    const password = request.headers.get("X-Admin-Password");
    if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
      return json({ error: "Unauthorized" }, 401);
    }
    const ratings = await getAllRatingsForPaper(env.DB, adminRatingsMatch[1]);
    return json({ ratings: ratings.map((r) => ({ stars: r.stars, comment: r.comment, created_at: r.created_at })) });
  }

  // POST /api/admin/clear-ratings — clear ratings for given paper IDs
  if (path === "/api/admin/clear-ratings" && method === "POST") {
    const password = request.headers.get("X-Admin-Password");
    if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
      return json({ error: "Unauthorized" }, 401);
    }
    const body = await request.json<{ paper_ids: string[] }>();
    if (!body.paper_ids || !Array.isArray(body.paper_ids)) {
      return json({ error: "paper_ids array required" }, 400);
    }
    for (const id of body.paper_ids) {
      await clearRatingsForPaper(env.DB, id);
    }
    return json({ ok: true, cleared: body.paper_ids.length });
  }

  // GET /api/admin/has-low-ratings — dashboard alert check
  if (path === "/api/admin/has-low-ratings" && method === "GET") {
    const password = request.headers.get("X-Admin-Password");
    if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
      return json({ error: "Unauthorized" }, 401);
    }
    const hasLow = await hasAnyLowRatings(env.DB);
    return json({ has_low_ratings: hasLow });
  }

  // --- Lists ---

  // POST /api/lists — create a new list
  if (path === "/api/lists" && method === "POST") {
    const body = await request.json<{ name?: string; description?: string }>();
    if (!body.name || !body.name.trim()) {
      return json({ error: "name is required" }, 400);
    }
    const id = await generateListId(env.DB);
    const ownerToken = crypto.randomUUID().replace(/-/g, "");
    const ip = request.headers.get("CF-Connecting-IP") || null;
    const list = await createList(env.DB, id, ownerToken, body.name.trim(), (body.description || "").trim(), ip);
    return json({
      list: { id: list.id, name: list.name, description: list.description, created_at: list.created_at, updated_at: list.updated_at, paper_count: 0 },
      owner_token: ownerToken,
    }, 201);
  }

  // GET /api/my-lists — get lists owned by token
  if (path === "/api/my-lists" && method === "GET") {
    const token = request.headers.get("X-List-Token");
    if (!token) return json({ error: "X-List-Token header required" }, 401);
    const lists = await getListsByToken(env.DB, token);
    return json({
      lists: lists.map((l) => ({
        id: l.id, name: l.name, description: l.description,
        created_at: l.created_at, updated_at: l.updated_at, paper_count: l.paper_count,
      })),
    });
  }

  // GET /api/admin/lists — all lists with tokens (admin recovery)
  if (path === "/api/admin/lists" && method === "GET") {
    const password = request.headers.get("X-Admin-Password");
    if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
      return json({ error: "Unauthorized" }, 401);
    }
    const lists = await getAllLists(env.DB);
    return json({
      lists: lists.map((l) => ({
        id: l.id, name: l.name, description: l.description, owner_token: l.owner_token,
        creator_ip: l.creator_ip, created_at: l.created_at, paper_count: l.paper_count,
      })),
    });
  }

  // GET /api/lists/:id — get list with papers (public)
  const listGetMatch = path.match(/^\/api\/lists\/([a-z0-9]{4})$/);
  if (listGetMatch && method === "GET") {
    const list = await getList(env.DB, listGetMatch[1]);
    if (!list) return json({ error: "List not found" }, 404);
    const items = await getListItems(env.DB, list.id);
    const paperIds = items.map((i) => i.paper_id);
    const papers = paperIds.length > 0 ? await getPapersBatch(env.DB, paperIds) : [];
    const paperMap = new Map(papers.map((p) => [p.id, p]));
    // Return papers in list order, with null for papers not in DB
    const orderedPapers = paperIds.map((id) => {
      const p = paperMap.get(id);
      return p ? paperToResponse(p, baseUrl) : { id, not_found: true };
    });
    return json({
      list: { id: list.id, name: list.name, description: list.description, created_at: list.created_at, updated_at: list.updated_at, paper_count: items.length },
      papers: orderedPapers,
    });
  }

  // PUT /api/lists/:id — update name/description
  const listPutMatch = path.match(/^\/api\/lists\/([a-z0-9]{4})$/);
  if (listPutMatch && method === "PUT") {
    const token = request.headers.get("X-List-Token");
    const list = await getList(env.DB, listPutMatch[1]);
    if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
    const body = await request.json<{ name?: string; description?: string }>();
    await updateList(env.DB, list.id, (body.name ?? list.name).trim(), (body.description ?? list.description).trim());
    return json({ ok: true });
  }

  // DELETE /api/lists/:id — delete list
  const listDeleteMatch = path.match(/^\/api\/lists\/([a-z0-9]{4})$/);
  if (listDeleteMatch && method === "DELETE") {
    const token = request.headers.get("X-List-Token");
    const list = await getList(env.DB, listDeleteMatch[1]);
    if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
    await deleteList(env.DB, list.id);
    return json({ ok: true });
  }

  // POST /api/lists/:id/items — add papers to list
  const listItemsAddMatch = path.match(/^\/api\/lists\/([a-z0-9]{4})\/items$/);
  if (listItemsAddMatch && method === "POST") {
    const token = request.headers.get("X-List-Token");
    const list = await getList(env.DB, listItemsAddMatch[1]);
    if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
    const body = await request.json<{ paper_ids?: string[] }>();
    if (!body.paper_ids || !Array.isArray(body.paper_ids)) {
      return json({ error: "paper_ids array required" }, 400);
    }
    const added = await addListItems(env.DB, list.id, body.paper_ids);
    return json({ ok: true, added });
  }

  // DELETE /api/lists/:id/items/:paperId — remove paper from list
  const listItemRemoveMatch = path.match(/^\/api\/lists\/([a-z0-9]{4})\/items\/([^/]+)$/);
  if (listItemRemoveMatch && method === "DELETE") {
    const token = request.headers.get("X-List-Token");
    const list = await getList(env.DB, listItemRemoveMatch[1]);
    if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
    await removeListItem(env.DB, list.id, listItemRemoveMatch[2]);
    return json({ ok: true });
  }

  // PUT /api/lists/:id/reorder — reorder list items
  const listReorderMatch = path.match(/^\/api\/lists\/([a-z0-9]{4})\/reorder$/);
  if (listReorderMatch && method === "PUT") {
    const token = request.headers.get("X-List-Token");
    const list = await getList(env.DB, listReorderMatch[1]);
    if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
    const body = await request.json<{ paper_ids?: string[] }>();
    if (!body.paper_ids || !Array.isArray(body.paper_ids)) {
      return json({ error: "paper_ids array required" }, 400);
    }
    await reorderListItems(env.DB, list.id, body.paper_ids);
    return json({ ok: true });
  }

  // POST /api/lists/:id/import — bulk import arXiv IDs
  const listImportMatch = path.match(/^\/api\/lists\/([a-z0-9]{4})\/import$/);
  if (listImportMatch && method === "POST") {
    const token = request.headers.get("X-List-Token");
    const list = await getList(env.DB, listImportMatch[1]);
    if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
    const body = await request.json<{ raw_text?: string }>();
    if (!body.raw_text) return json({ error: "raw_text required" }, 400);

    // Parse all arXiv IDs from text
    const chunks = body.raw_text.split(/[\s,;]+/).filter(Boolean);
    const parsed = new Map<string, boolean>(); // id -> valid
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

    // Check which exist in DB
    const existing = await getPapersBatch(env.DB, ids);
    const existingIds = new Set(existing.map((p) => p.id));
    const missing = ids.filter((id) => !existingIds.has(id));

    // Auto-add missing papers from arXiv (cap at 20)
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const cf = (request as any).cf;
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
          submitted_by_country: cf?.country || null,
          submitted_by_city: cf?.city || null,
        });
      } catch {
        invalid.push(arxivId);
      }
    }
    // IDs beyond the cap are added to invalid
    for (const id of missing.slice(20)) {
      invalid.push(id);
    }

    // Add all valid IDs to list
    const validIds = ids.filter((id) => !invalid.includes(id));
    const actuallyAdded = await addListItems(env.DB, list.id, validIds);
    const duplicateCount = validIds.length - actuallyAdded;

    // Fetch final paper data
    const allPapers = validIds.length > 0 ? await getPapersBatch(env.DB, validIds) : [];
    return json({
      added: allPapers.map((p) => paperToResponse(p, baseUrl)),
      duplicates: duplicateCount,
      invalid,
    });
  }

  // POST /api/webhooks/modal
  if (path === "/api/webhooks/modal" && method === "POST") {
    return handleModalWebhook(request, env);
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
    papers = await getRecentPapers(env.DB, perPage, offset);
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

  // --- Use pre-scraped metadata if provided, otherwise scrape ---
  let metadata;
  if (body.metadata && body.metadata.id === arxivId) {
    metadata = body.metadata;
  } else {
    try {
      metadata = await scrapeArxivMetadata(arxivId);
    } catch (e: any) {
      return json({ error: e.message }, 422);
    }
  }

  // --- Insert paper with status "not_requested" ---
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const cf = (request as any).cf;
  const inserted = await insertPaper(env.DB, {
    id: metadata.id,
    arxiv_url: metadata.arxiv_url,
    title: metadata.title,
    authors: metadata.authors,
    abstract: metadata.abstract,
    published_date: metadata.published_date,
    submitted_by_ip: ip,
    submitted_by_country: cf?.country || null,
    submitted_by_city: cf?.city || null,
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
  baseUrl: string
): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) {
    return json({ error: "Paper not found" }, 404);
  }

  if (paper.status !== "not_requested") {
    return json({ error: "Narration already requested" }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const isAdmin = env.ADMIN_PASSWORD && request.headers.get("X-Admin-Password") === env.ADMIN_PASSWORD;

  if (!isAdmin) {
    // Rate limiting
    const ipLimit = parseInt(env.PER_IP_DAILY_LIMIT || "10");
    const ipCount = await getSubmissionCount(env.DB, ip);
    if (ipCount >= ipLimit) {
      return json(
        { error: `Rate limit exceeded. Maximum ${ipLimit} narrations per day.` },
        429
      );
    }

    const globalLimit = parseInt(env.DAILY_GLOBAL_LIMIT || "50");
    const globalCount = await getGlobalSubmissionCount(env.DB);
    if (globalCount >= globalLimit) {
      return json(
        { error: "The service is at capacity for today. Please try again tomorrow." },
        503
      );
    }

    // Turnstile captcha disabled for now
    // const hourlyCount = await getNarrationCountLastHour(env.DB, ip);
    // if (hourlyCount > 2) {
    //   const body = await request.json<{ turnstile_token?: string }>().catch(() => ({}));
    //   if (!body.turnstile_token) {
    //     return json({ error: "Turnstile verification required" }, 400);
    //   }
    //   const turnstileValid = await verifyTurnstile(
    //     body.turnstile_token,
    //     ip,
    //     env.TURNSTILE_SECRET_KEY
    //   );
    //   if (!turnstileValid) {
    //     return json({ error: "Turnstile verification failed" }, 403);
    //   }
    // }
  }

  // Update status to queued
  await updatePaperStatus(env.DB, id, "queued");
  await recordSubmission(env.DB, ip);

  // Dispatch to Modal
  if (env.MODAL_FUNCTION_URL) {
    try {
      const meta = await scrapeArxivMetadata(id);
      await fetch(env.MODAL_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.MODAL_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify({
          arxiv_id: id,
          tex_source_url: meta.tex_source_url,
          callback_url: `${baseUrl}/api/webhooks/modal`,
          paper_title: paper.title,
          paper_author: JSON.parse(paper.authors).join(", "),
        }),
      });
    } catch (e: any) {
      console.error("Failed to dispatch to Modal:", e);
    }
  }

  const updated = await getPaper(env.DB, id);
  return json(paperToResponse(updated!, baseUrl));
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
  baseUrl: string
): Promise<Response> {
  const password = request.headers.get("X-Admin-Password");
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Parse body: mode ("full" | "script_only" | "narration_only"), wipe_reviews
  let wipeReviews = false;
  let mode = "full";
  try {
    const body = await request.json<{ wipe_reviews?: boolean; mode?: string }>();
    wipeReviews = !!body?.wipe_reviews;
    if (body?.mode && ["full", "script_only", "narration_only"].includes(body.mode)) {
      mode = body.mode;
    }
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
      authors: typeof paper.authors === "string" ? JSON.parse(paper.authors) : paper.authors,
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
          mode,
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
  const password = request.headers.get("X-Admin-Password");
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return json({ error: "Unauthorized" }, 401);
  }

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

async function handleGetAudio(env: Env, id: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper || paper.status !== "complete" || !paper.audio_r2_key) {
    return json({ error: "Audio not available" }, 404);
  }

  const object = await env.AUDIO_BUCKET.get(paper.audio_r2_key);
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

async function handleGetTranscript(env: Env, id: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper || !["generating_audio", "complete"].includes(paper.status)) {
    return json({ error: "Transcript not available" }, 404);
  }

  const r2Key = `transcripts/${id}.txt`;
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
  await recordVisit(env.DB, id, ip);
  return json({ ok: true });
}

async function handleModalWebhook(request: Request, env: Env): Promise<Response> {
  // Verify webhook secret
  const authHeader = request.headers.get("Authorization");
  if (env.MODAL_WEBHOOK_SECRET && authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json<{
    arxiv_id: string;
    status: string;
    progress_detail?: string;
    error_message?: string;
    audio_r2_key?: string;
    audio_size_bytes?: number;
    duration_seconds?: number;
  }>();

  if (!body.arxiv_id || !body.status) {
    return json({ error: "arxiv_id and status required" }, 400);
  }

  await updatePaperStatus(env.DB, body.arxiv_id, body.status as any, {
    progress_detail: body.progress_detail,
    error_message: body.error_message,
    audio_r2_key: body.audio_r2_key,
    audio_size_bytes: body.audio_size_bytes,
    duration_seconds: body.duration_seconds,
  });

  return json({ ok: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function verifyTurnstile(
  token: string,
  ip: string,
  secretKey: string
): Promise<boolean> {
  if (!secretKey) return true; // Skip in dev

  const formData = new URLSearchParams();
  formData.append("secret", secretKey);
  formData.append("response", token);
  formData.append("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }
  );

  const result = await response.json<{ success: boolean }>();
  return result.success;
}

function json(data: any, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}
