/**
 * Admin-related API handlers.
 */

import type { Env } from "../types";
import { paperToResponse } from "../types";
import {
  getTopContributors,
  getAllPapersWithRatings,
  getAllRatingsForPaper,
  clearRatingsForPaper,
  hasAnyLowRatings,
  getAllLists,
} from "../db";
import { json, requireAdmin } from "./helpers";

export async function handleAdminVerify(request: Request, env: Env): Promise<Response> {
  const password = request.headers.get("X-Admin-Password");
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return json({ error: "Invalid password" }, 401);
  }
  return json({ ok: true });
}

export async function handleAdminStats(request: Request, env: Env): Promise<Response> {
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

export async function handleAdminPapersWithRatings(request: Request, env: Env, baseUrl: string): Promise<Response> {
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

export async function handleAdminPaperRatings(request: Request, env: Env, paperId: string): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const ratings = await getAllRatingsForPaper(env.DB, paperId);
  return json({ ratings: ratings.map((r) => ({ stars: r.stars, comment: r.comment, voice_tier: r.voice_tier, created_at: r.created_at })) });
}

export async function handleAdminClearRatings(request: Request, env: Env): Promise<Response> {
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

export async function handleAdminHasLowRatings(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const hasLow = await hasAnyLowRatings(env.DB);
  return json({ has_low_ratings: hasLow });
}

export async function handleAdminLists(request: Request, env: Env): Promise<Response> {
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
