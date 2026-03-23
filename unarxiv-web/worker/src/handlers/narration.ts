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
} from "../db";
import { arxivSrcUrl, scrapeArxivMetadata } from "../arxiv";
import { json, requireAdmin } from "./helpers";
import { computeQualityRank } from "./premium";

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

// ─── Narration Check ─────────────────────────────────────────────────────────

export async function handleNarrationCheck(
  request: Request,
  env: Env
): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
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
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
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

  // Legacy fallback: flatten nested provider/cost objects from old Modal payloads.
  // New Modal sends flat fields + explicit version_type. Remove this block after
  // all in-flight narrations from the old Modal code have completed (~1 week).
  if (body.providers) {
    console.warn(`[webhook] Legacy nested 'providers' payload for ${body.arxiv_id} — update Modal`);
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
  // Legacy: Modal used to send script_r2_key instead of transcript_r2_key
  if (!body.transcript_r2_key && body.script_r2_key) {
    body.transcript_r2_key = body.script_r2_key;
  }
  // Legacy: infer narration_tier from quality_rank/tts_provider if Modal didn't send it explicitly
  if (!body.narration_tier && body.quality_rank != null && body.quality_rank > 0) {
    console.warn(`[webhook] Legacy quality_rank-based narration_tier inference for ${body.arxiv_id}`);
    const provider = body.tts_provider ?? "";
    body.narration_tier = provider === "elevenlabs" ? "plus3" : provider === "openai" ? "plus2" : "plus1";
  }

  // Update script_char_count if provided (from script generation phase)
  if (body.script_char_count != null && body.script_char_count > 0) {
    await updateScriptCharCount(env.DB, body.arxiv_id, body.script_char_count);
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
    eta_seconds: body.eta_seconds,
    audio_r2_key: body.audio_r2_key,
    audio_size_bytes: body.audio_size_bytes,
    duration_seconds: body.duration_seconds,
  });

  // On completion, record a narration_version and update best_version_id
  if (body.status === "narrated" && body.audio_r2_key) {
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
