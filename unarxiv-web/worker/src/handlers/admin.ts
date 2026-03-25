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
  getVersionsWithScores,
  insertNarrationScore,
  getScoreTrends,
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
      best_narration_tier: p.best_narration_tier ?? null,
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

// ─── Cost model training endpoints ───────────────────────────────────────────

/** GET /api/admin/cost-training-data
 * Returns narration_versions rows joined with papers source stats.
 * Used by the Modal cost model training function to fetch training data.
 */
export async function handleAdminCostTrainingData(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;

  const rows = await env.DB
    .prepare(`
      SELECT
        nv.id, nv.paper_id, nv.provider_model,
        nv.actual_input_tokens, nv.actual_output_tokens,
        nv.actual_cost, nv.llm_cost, nv.created_at,
        p.latex_char_count, p.figure_count, p.tar_bytes,
        p.script_char_count
      FROM narration_versions nv
      JOIN papers p ON p.id = nv.paper_id
      WHERE nv.actual_input_tokens IS NOT NULL
        AND nv.actual_output_tokens IS NOT NULL
        AND nv.provider_model IS NOT NULL
        AND p.latex_char_count IS NOT NULL
      ORDER BY nv.created_at DESC
    `)
    .all<{
      id: number; paper_id: string; provider_model: string;
      actual_input_tokens: number; actual_output_tokens: number;
      actual_cost: number | null; llm_cost: number | null; created_at: string;
      latex_char_count: number; figure_count: number; tar_bytes: number;
      script_char_count: number | null;
    }>();

  return json({ rows: rows.results, count: rows.results.length });
}

/** POST /api/admin/model-coefficients
 * Stores trained linear regression coefficients from the Modal training function.
 * Expects JSON body matching the model_coefficients table schema.
 */
export async function handleAdminStoreModelCoefficients(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;

  let body: {
    provider_model: string;
    input_token_coeffs: number[];
    input_token_intercept: number;
    output_token_coeffs: number[];
    output_token_intercept: number;
    input_rmse: number;
    output_rmse: number;
    proxy_input_rmse: number;
    proxy_output_rmse: number;
    sample_count: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.provider_model || !Array.isArray(body.input_token_coeffs)) {
    return json({ error: "Missing required fields" }, 400);
  }

  await env.DB
    .prepare(`
      INSERT INTO model_coefficients
        (provider_model, input_token_coeffs, input_token_intercept,
         output_token_coeffs, output_token_intercept,
         input_rmse, output_rmse, proxy_input_rmse, proxy_output_rmse,
         sample_count, trained_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(provider_model) DO UPDATE SET
        input_token_coeffs     = excluded.input_token_coeffs,
        input_token_intercept  = excluded.input_token_intercept,
        output_token_coeffs    = excluded.output_token_coeffs,
        output_token_intercept = excluded.output_token_intercept,
        input_rmse             = excluded.input_rmse,
        output_rmse            = excluded.output_rmse,
        proxy_input_rmse       = excluded.proxy_input_rmse,
        proxy_output_rmse      = excluded.proxy_output_rmse,
        sample_count           = excluded.sample_count,
        trained_at             = datetime('now')
    `)
    .bind(
      body.provider_model,
      JSON.stringify(body.input_token_coeffs),
      body.input_token_intercept,
      JSON.stringify(body.output_token_coeffs),
      body.output_token_intercept,
      body.input_rmse,
      body.output_rmse,
      body.proxy_input_rmse,
      body.proxy_output_rmse,
      body.sample_count,
    )
    .run();

  return json({ ok: true, provider_model: body.provider_model });
}

// ─── Narration Versions + Scores ─────────────────────────────────────────────

/** GET /api/admin/papers/:id/versions — all versions with latest score. */
export async function handleAdminGetVersionsWithScores(request: Request, env: Env, paperId: string): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const versions = await getVersionsWithScores(env.DB, paperId);
  return json({ versions });
}

/** GET /api/admin/score-stats — daily + summary score trends for the Quality Insights panel. */
export async function handleAdminScoreStats(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;
  const data = await getScoreTrends(env.DB);
  return json(data);
}

/** POST /api/admin/scores — insert a narration quality score. */
export async function handleAdminSubmitScore(request: Request, env: Env): Promise<Response> {
  const authErr = requireAdmin(request, env);
  if (authErr) return authErr;

  let body: {
    version_id: number;
    scored_by?: string;
    score_fidelity?: number | null;
    score_citations?: number | null;
    score_header?: number | null;
    score_figures?: number | null;
    score_tts?: number | null;
    score_overall?: number | null;
    notes?: string | null;
    parser_commit?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.version_id || typeof body.version_id !== "number") {
    return json({ error: "version_id (number) required" }, 400);
  }

  const result = await insertNarrationScore(env.DB, body);
  return json({ ok: true, id: result.id });
}
