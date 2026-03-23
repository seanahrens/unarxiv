/**
 * User-related handlers: playlist, listen history, playback positions,
 * ratings, token merging, and user additions.
 */

import type { Env, Paper } from "../types";
import { paperToResponse } from "../types";
import {
  getUserPlaylist,
  setUserPlaylist,
  addToUserPlaylist,
  removeFromUserPlaylist,
  getUserListenHistory,
  markPaperListened,
  unmarkPaperListened,
  mergeTokens,
  savePlaybackPosition,
  getPlaybackPositions,
  getRating,
  upsertRating,
  deleteRating,
  getPapersBySubmitterIp,
  getPapersBySubmitterToken,
  deletePaper,
  getPaper,
  getBestVoiceTier,
} from "../db";
import { json, getUserToken, getClientIp } from "./helpers";

// --- Rating ---

export async function handleRating(request: Request, env: Env, paperId: string): Promise<Response> {
  const method = request.method;
  const ip = getClientIp(request);
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

// --- My additions ---

export async function handleMyAdditions(request: Request, env: Env, baseUrl: string): Promise<Response> {
  const ip = getClientIp(request);
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

export async function handleDeleteMyAddition(request: Request, env: Env, id: string): Promise<Response> {
  const ip = getClientIp(request);
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

// --- Playlist endpoints ---

export async function handleGetPlaylist(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  const items = await getUserPlaylist(env.DB, token);
  return json({ playlist: items.map((i) => ({ paperId: i.paper_id, addedAt: i.added_at })) });
}

export async function handleUpdatePlaylist(request: Request, env: Env): Promise<Response> {
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

export async function handleAddToPlaylist(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  const body = await request.json<{ paperId?: string }>();
  if (!body.paperId) return json({ error: "paperId required" }, 400);
  const added = await addToUserPlaylist(env.DB, token, body.paperId);
  return json({ ok: true, added });
}

export async function handleRemoveFromPlaylist(request: Request, env: Env, paperId: string): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  await removeFromUserPlaylist(env.DB, token, paperId);
  return json({ ok: true });
}

// --- Listen history endpoints ---

export async function handleGetListenHistory(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  const items = await getUserListenHistory(env.DB, token);
  return json({ history: items.map((i) => ({ paperId: i.paper_id, readAt: i.read_at })) });
}

export async function handleMarkListened(request: Request, env: Env, paperId: string): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  await markPaperListened(env.DB, token, paperId);
  return json({ ok: true });
}

export async function handleUnmarkListened(request: Request, env: Env, paperId: string): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token required" }, 401);
  await unmarkPaperListened(env.DB, token, paperId);
  return json({ ok: true });
}

// --- Token merge ---

export async function handleMergeTokens(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ oldToken?: string; newToken?: string }>();
  if (!body.oldToken || !body.newToken || body.oldToken === body.newToken) {
    return json({ error: "oldToken and newToken are required and must differ" }, 400);
  }
  await mergeTokens(env.DB, body.oldToken, body.newToken);
  return json({ ok: true });
}

// --- Playback positions ---

export async function handleSavePosition(request: Request, env: Env, paperId: string): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token header required" }, 401);
  const body = await request.json<{ position?: number }>();
  if (typeof body.position !== "number" || body.position < 0) {
    return json({ error: "position must be a non-negative number" }, 400);
  }
  await savePlaybackPosition(env.DB, token, paperId, body.position);
  return json({ ok: true });
}

export async function handleGetPositions(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-User-Token");
  if (!token) return json({ error: "X-User-Token header required" }, 401);
  const positions = await getPlaybackPositions(env.DB, token);
  const map: Record<string, { position: number; updated_at: string }> = {};
  for (const p of positions) {
    map[p.paper_id] = { position: p.position, updated_at: p.updated_at };
  }
  return json({ positions: map });
}
