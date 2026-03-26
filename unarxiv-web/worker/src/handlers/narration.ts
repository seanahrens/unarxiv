/**
 * Narration handlers — basic narration trigger, Modal dispatch/webhook,
 * audio/transcript serving, reprocess, delete, progress, and visit recording.
 */

import type { Env, Paper, PaperStatus } from "../types";
import { paperToResponse } from "../types";
import {
  getPaper,
  claimPaperForNarration,
  updatePaperStatus,
  getSubmissionCount,
  recordSubmission,
  resetPaperForReprocess,
  clearRatingsForPaper,
  deletePaper,
  getVersionById,
  recordVisit,
  updateScriptCharCount,
  insertNarrationVersion,
  updateBestVersionId,
  updatePaperSourceStats,
} from "../db";
import { arxivSrcUrl, scrapeArxivMetadata } from "../arxiv";
import { json, requireAdmin, getClientIp } from "./helpers";
import { computeQualityRank } from "./premium";
import { legacyBaseTranscriptKey } from "./r2paths";
import { claimPaperForPremium, findExistingPremiumScript } from "../db";

// ─── Narration Trigger ───────────────────────────────────────────────────────

export async function handleNarratePaper(
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

  // If we have a server-side Anthropic key, user-initiated narrations get a
  // sponsored plus1 upgrade (LLM-improved script + free Microsoft TTS voice).
  if (env.ANTHROPIC_API_KEY) {
    return handleSponsoredPlus1(request, env, paper, id, baseUrl, ctx);
  }

  // Fallback: base narration (no LLM scripting, no server key configured)
  const claimed = await claimPaperForNarration(env.DB, id);

  if (claimed) {
    const ip = getClientIp(request);
    const isAdmin = request.headers.get("X-Admin-Password") === env.ADMIN_PASSWORD && !!env.ADMIN_PASSWORD;
    if (!isAdmin) {
      const limit = parseInt(env.PER_IP_DAILY_LIMIT || "24");
      const count = await getSubmissionCount(env.DB, ip);
      if (count >= limit) {
        await updatePaperStatus(env.DB, id, "unnarrated");
        return json({ error: "Daily narration limit reached. Try again tomorrow." }, 429);
      }
    }
    await recordSubmission(env.DB, ip);

    const dispatch = getPaper(env.DB, id).then((p) => {
      if (p && p.status === "narrating") {
        return dispatchToModal(env, p, baseUrl);
      }
    });
    if (ctx) ctx.waitUntil(dispatch);
    else void dispatch;
  }

  const updated = await getPaper(env.DB, id);
  return json(paperToResponse(updated!, baseUrl));
}

/**
 * Sponsored plus1 narration: uses the server's own Anthropic API key for LLM
 * script improvement + free Microsoft TTS (Eric voice). No user key required.
 */
async function handleSponsoredPlus1(
  request: Request,
  env: Env,
  paper: Paper,
  id: string,
  baseUrl: string,
  ctx?: ExecutionContext
): Promise<Response> {
  // Use premium claim (allows narrated → narrating for upgrades)
  const claimed = await claimPaperForPremium(env.DB, id);
  if (!claimed) {
    // Fall back to standard claim for unnarrated/failed papers
    const baseClaimed = await claimPaperForNarration(env.DB, id);
    if (!baseClaimed) {
      // Already narrating
      const updated = await getPaper(env.DB, id);
      return json(paperToResponse(updated!, baseUrl));
    }
  }

  // Rate limit check
  const ip = getClientIp(request);
  const isAdmin = request.headers.get("X-Admin-Password") === env.ADMIN_PASSWORD && !!env.ADMIN_PASSWORD;
  if (!isAdmin) {
    const limit = parseInt(env.PER_IP_DAILY_LIMIT || "24");
    const count = await getSubmissionCount(env.DB, ip);
    if (count >= limit) {
      await updatePaperStatus(env.DB, id, paper.status as PaperStatus);
      return json({ error: "Daily narration limit reached. Try again tomorrow." }, 429);
    }
  }
  await recordSubmission(env.DB, ip);

  // Dispatch sponsored plus1 to Modal premium endpoint
  const previousStatus = paper.status as PaperStatus;
  const dispatch = async () => {
    if (!env.MODAL_FUNCTION_URL) {
      console.log(`[local-dev] Skipping sponsored plus1 dispatch for ${id}`);
      return;
    }
    try {
      // Check for existing premium script to reuse
      let existingScript: string | null = null;
      const scriptR2Key = await findExistingPremiumScript(env.DB, id);
      if (scriptR2Key) {
        try {
          const obj = await env.AUDIO_BUCKET.get(scriptR2Key);
          if (obj) existingScript = await obj.text();
        } catch {}
      }

      const payload: Record<string, string | null> = {
        arxiv_id: id,
        tex_source_url: arxivSrcUrl(id),
        callback_url: `${baseUrl}/api/webhooks/modal`,
        paper_title: paper.title,
        paper_author: (JSON.parse(paper.authors) as string[]).join(", "),
        paper_date: paper.published_date || "",
        narration_mode: "premium",
        llm_provider: "anthropic",
        llm_api_key: env.ANTHROPIC_API_KEY!,
        llm_model: "",  // Modal picks default
        tts_provider: "free",
        tts_api_key: "",
        tts_model: "",
        source_preference: "tex",
        scripter_mode: "hybrid",
        _secret: env.MODAL_WEBHOOK_SECRET,
      };
      if (existingScript) {
        payload.existing_script = existingScript;
      }

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
        console.error(`Sponsored plus1 dispatch failed for ${id}: ${resp.status}`);
        await updatePaperStatus(env.DB, id, previousStatus);
      }
    } catch (e: any) {
      console.error(`Failed to dispatch sponsored plus1 for ${id}:`, e);
      await updatePaperStatus(env.DB, id, previousStatus);
    }
  };

  if (ctx) ctx.waitUntil(dispatch());
  else void dispatch();

  const updated = await getPaper(env.DB, id);
  return json(paperToResponse(updated!, baseUrl));
}

// ─── Modal Dispatch ──────────────────────────────────────────────────────────

/**
 * Dispatch a single paper to Modal for narration. Paper should already be in "narrating" status.
 * On failure, reverts to "unnarrated" so the user can retry.
 */
export async function dispatchToModal(
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

// ─── Stale Paper Recovery (Cron) ─────────────────────────────────────────────

/**
 * Cron safety net: re-dispatch papers stuck in "narrating" for over 20 minutes.
 * This handles cases where Modal never called back (crash, timeout, network error).
 */
export async function recoverStalePapers(env: Env): Promise<void> {
  if (!env.MODAL_FUNCTION_URL) return;

  const baseUrl = "https://api.unarxiv.org";
  const MAX_RETRIES = 3;

  try {
    const stuck = await env.DB.prepare(
      `SELECT * FROM papers WHERE status = 'narrating'
       AND updated_at < datetime('now', '-20 minutes')`
    ).all<Paper>();

    for (const paper of stuck.results) {
      const currentRetries = paper.retry_count ?? 0;
      if (currentRetries >= MAX_RETRIES) {
        console.log(`Paper ${paper.id} exceeded max retries (${currentRetries}/${MAX_RETRIES}), marking as failed`);
        await updatePaperStatus(env.DB, paper.id, "failed", {
          error_message: `Gave up after ${currentRetries} attempts`,
          error_category: "timeout",
        });
        continue;
      }

      console.log(`Recovering stale paper: ${paper.id} (attempt ${currentRetries + 1}/${MAX_RETRIES})`);
      // Increment retry_count for the recovery attempt
      await env.DB.prepare(
        "UPDATE papers SET retry_count = COALESCE(retry_count, 0) + 1, eta_seconds = NULL, updated_at = datetime('now') WHERE id = ?"
      ).bind(paper.id).run();
      await dispatchToModal(env, paper, baseUrl);
    }
  } catch (e: any) {
    console.error("Failed to recover stale papers:", e);
  }
}

// ─── Narration Check ─────────────────────────────────────────────────────────

export async function handleNarrationCheck(
  _request: Request,
  _env: Env
): Promise<Response> {
  // Turnstile captcha disabled for now
  return json({ captcha_required: false });
}

// ─── Reprocess Paper (Admin) ─────────────────────────────────────────────────

export async function handleReprocessPaper(
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
  let scripterMode = "regex";
  try {
    const body = await request.json<{ wipe_reviews?: boolean; mode?: string; source_priority?: string; scripter_mode?: string }>();
    wipeReviews = !!body?.wipe_reviews;
    if (body?.mode && ["full", "script_only", "narration_only"].includes(body.mode)) {
      mode = body.mode;
    }
    if (body?.source_priority === "pdf") sourcePriority = "pdf";
    if (body?.scripter_mode && ["regex", "llm", "hybrid"].includes(body.scripter_mode)) {
      scripterMode = body.scripter_mode;
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
    try {
      await env.AUDIO_BUCKET.delete(legacyBaseTranscriptKey(id));
    } catch (e) {
      console.error(`Failed to delete transcript for ${id}:`, e);
    }
  }
  if (mode !== "script_only") {
    // Delete old audio (will be regenerated)
    if (paper.audio_r2_key) {
      try {
        await env.AUDIO_BUCKET.delete(paper.audio_r2_key);
      } catch (e) {
        console.error(`Failed to delete audio for ${id}:`, e);
      }
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
          scripter_mode: scripterMode,
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

// ─── Delete Paper (Admin) ────────────────────────────────────────────────────

export async function handleDeletePaper(
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

// ─── Audio Serving ───────────────────────────────────────────────────────────

export async function handleGetAudio(env: Env, id: string, url: URL): Promise<Response> {
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

// ─── Transcript Serving ──────────────────────────────────────────────────────

export async function handleGetTranscript(env: Env, id: string, url: URL): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper || !["narrating", "narrated"].includes(paper.status)) {
    return json({ error: "Transcript not available" }, 404);
  }

  // Support ?version=<id> for version-specific transcripts.
  // Default: use best_version_id's transcript, falling back to legacy path.
  let r2Key: string | null = null;
  const versionParam = url.searchParams.get("version");
  const versionId = versionParam
    ? parseInt(versionParam, 10)
    : paper.best_version_id;

  if (versionId && !isNaN(versionId)) {
    const version = await getVersionById(env.DB, versionId, id);
    if (version?.transcript_r2_key) {
      r2Key = version.transcript_r2_key;
    }
  }
  if (!r2Key) {
    r2Key = legacyBaseTranscriptKey(id);
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

// ─── Progress ────────────────────────────────────────────────────────────────

export async function handleGetProgress(env: Env, id: string, baseUrl: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) {
    return json({ error: "Paper not found" }, 404);
  }
  return json(paperToResponse(paper, baseUrl));
}

// ─── Visit Recording ─────────────────────────────────────────────────────────

export async function handleRecordVisit(request: Request, env: Env, id: string): Promise<Response> {
  const ip = getClientIp(request);
  const token = request.headers.get("X-User-Token") || null;
  await recordVisit(env.DB, id, ip, token);
  return json({ ok: true });
}

// ─── Modal Webhook ───────────────────────────────────────────────────────────

// "Modal" here refers to Modal.com (the serverless Python platform), not a UI dialog.
export async function handleModalWebhook(request: Request, env: Env): Promise<Response> {
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
    error_category?: string;
    eta_seconds?: number;
    audio_r2_key?: string;
    audio_size_bytes?: number;
    duration_seconds?: number;
    // Premium narration fields
    narration_tier?: "base" | "plus1" | "plus2" | "plus3";
    tts_provider?: string;
    tts_model?: string;
    llm_provider?: string;
    llm_model?: string;
    transcript_r2_key?: string;
    actual_cost?: number;
    llm_cost?: number;
    tts_cost?: number;
    script_char_count?: number;
    // Track 1: source stats for cost estimation
    tar_bytes?: number;
    latex_char_count?: number;
    figure_count?: number;
    // Track 2: actual LLM token counts for ML model training
    actual_input_tokens?: number;
    actual_output_tokens?: number;
    provider_model?: string;
    version_id?: string;
    // Track 3: scripting pipeline tracking
    scripter_mode?: string;
    script_latency_ms?: number;
  }>();

  if (!body.arxiv_id || !body.status) {
    return json({ error: "arxiv_id and status required" }, 400);
  }

  // Update script_char_count if provided (from script generation phase)
  if (body.script_char_count != null && body.script_char_count > 0) {
    await updateScriptCharCount(env.DB, body.arxiv_id, body.script_char_count);
  }

  // Persist source stats if provided (Track 1 — free and premium narrations)
  if (body.tar_bytes != null && body.tar_bytes > 0) {
    await updatePaperSourceStats(
      env.DB, body.arxiv_id,
      body.tar_bytes,
      body.latex_char_count ?? 0,
      body.figure_count ?? 0,
    );
  }

  // script_ready = LLM script is done, TTS still running. Record a partial
  // narration_version with the transcript so the frontend can show it, but
  // do NOT change the paper's status — it stays "narrating".
  // Must be handled before VALID_STATUSES check (script_ready is webhook-only, not a DB status).
  if (body.status === "script_ready" && body.transcript_r2_key) {
    const narrationTier = body.narration_tier ?? "plus1";
    const ttsProvider = body.tts_provider ?? null;
    const ttsModel = body.tts_model ?? null;
    const qualityRank = narrationTier === "base" ? 0 : computeQualityRank(ttsProvider, ttsModel);

    await insertNarrationVersion(env.DB, {
      paper_id: body.arxiv_id,
      narration_tier: narrationTier,
      quality_rank: qualityRank,
      tts_provider: ttsProvider,
      tts_model: ttsModel,
      llm_provider: body.llm_provider ?? null,
      llm_model: body.llm_model ?? null,
      audio_r2_key: null,  // no audio yet
      transcript_r2_key: body.transcript_r2_key,
      duration_seconds: null,
      actual_cost: null,
      llm_cost: body.llm_cost ?? null,
      tts_cost: null,
      actual_input_tokens: body.actual_input_tokens ?? null,
      actual_output_tokens: body.actual_output_tokens ?? null,
      provider_model: body.provider_model ?? null,
      scripter_mode: body.scripter_mode ?? null,
      script_latency_ms: body.script_latency_ms ?? null,
    });
    return json({ ok: true });
  }

  const VALID_STATUSES: PaperStatus[] = ["unnarrated", "narrating", "narrated", "failed"];
  if (!VALID_STATUSES.includes(body.status as PaperStatus)) {
    return json({ error: "Invalid status" }, 400);
  }

  // Validate audio_r2_key format to prevent path confusion in R2 lookups
  if (body.audio_r2_key !== undefined && !/^audio\/[\w.\/-]+\.mp3$/.test(body.audio_r2_key)) {
    return json({ error: "Invalid audio_r2_key format" }, 400);
  }

  await updatePaperStatus(env.DB, body.arxiv_id, body.status as PaperStatus, {
    progress_detail: body.progress_detail,
    error_message: body.error_message,
    error_category: body.error_category,
    eta_seconds: body.eta_seconds,
    audio_r2_key: body.audio_r2_key,
    audio_size_bytes: body.audio_size_bytes,
    duration_seconds: body.duration_seconds,
  });

  // On completion, record a narration_version and optionally update best_version_id
  if (body.status === "narrated" && (body.audio_r2_key || body.transcript_r2_key)) {
    const narrationTier = body.narration_tier ?? "base";
    const ttsProvider = body.tts_provider ?? null;
    const ttsModel = body.tts_model ?? null;
    const qualityRank = narrationTier === "base" ? 0 : computeQualityRank(ttsProvider, ttsModel);

    // Remove any partial version from script_ready (will be replaced with complete version)
    if (narrationTier !== "base") {
      await env.DB.prepare(
        "DELETE FROM narration_versions WHERE paper_id = ? AND narration_tier = ? AND audio_r2_key IS NULL"
      ).bind(body.arxiv_id, narrationTier).run();
    }

    const version = await insertNarrationVersion(env.DB, {
      paper_id: body.arxiv_id,
      narration_tier: narrationTier,
      quality_rank: qualityRank,
      tts_provider: ttsProvider,
      tts_model: ttsModel,
      llm_provider: body.llm_provider ?? null,
      llm_model: body.llm_model ?? null,
      audio_r2_key: body.audio_r2_key ?? null,
      transcript_r2_key: body.transcript_r2_key ?? null,
      duration_seconds: body.duration_seconds ?? null,
      actual_cost: body.actual_cost ?? null,
      llm_cost: body.llm_cost ?? null,
      tts_cost: body.tts_cost ?? null,
      actual_input_tokens: body.actual_input_tokens ?? null,
      actual_output_tokens: body.actual_output_tokens ?? null,
      provider_model: body.provider_model ?? null,
      scripter_mode: body.scripter_mode ?? null,
      script_latency_ms: body.script_latency_ms ?? null,
    });

    // Only update best_version_id when the version has audio (script_only versions don't)
    if (body.audio_r2_key) {
      await updateBestVersionId(env.DB, body.arxiv_id, version.id);
    }
  }

  return json({ ok: true });
}
