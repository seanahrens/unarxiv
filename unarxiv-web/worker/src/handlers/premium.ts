/**
 * Premium narration handlers — key encryption, cost estimation, version management.
 */

import type { Env, Paper, PaperStatus } from "../types";
import { paperToResponse } from "../types";
import { legacyBaseAudioKey, legacyPremiumAudioKey } from "./r2paths";
import {
  getPaper,
  claimPaperForPremium,
  insertNarrationVersion,
  getNarrationVersions,
  getVersionsWithScores,
  getVersionById,
  updateBestVersionId,
  updateScriptCharCount,
  findExistingPremiumScript,
  updatePaperStatus,
} from "../db";
import { arxivSrcUrl } from "../arxiv";
import { json, requireAdmin } from "./helpers";

// ─── Pricing & defaults ──────────────────────────────────────────────────────

export const PRICING = {
  llm: {
    openai: {
      "gpt-4o":      { input_per_1m_tokens: 2.50,  output_per_1m_tokens: 10.00 },
      "gpt-4o-mini": { input_per_1m_tokens: 0.15,  output_per_1m_tokens: 0.60  },
    },
    anthropic: {
      "claude-haiku-4-5-20251001":  { input_per_1m_tokens: 0.80,  output_per_1m_tokens: 4.00  },
      "claude-sonnet-4-6":          { input_per_1m_tokens: 3.00,  output_per_1m_tokens: 15.00 },
      // Legacy IDs kept so historical cost records still look up correctly
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
export const DEFAULT_MODELS = {
  llm: {
    openai:    "gpt-4o-mini",
    anthropic: "claude-sonnet-4-6",
  },
  tts: {
    openai:     "tts-1-hd",
    elevenlabs: "eleven_multilingual_v2",
    google:     "wavenet",
  },
} as const;

// ─── Utility functions ───────────────────────────────────────────────────────

/**
 * Quality rank for a premium narration configuration.
 * Free narrations are rank 0; premium ranks start at 5.
 * Higher = better quality / more expensive.
 */
export function computeQualityRank(ttsProvider: string | null, ttsModel: string | null): number {
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
export async function deriveAesKey(keyMaterial: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(keyMaterial);
  const hashed = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hashed, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Encrypt a plaintext string using AES-256-GCM. Returns base64(iv || ciphertext). */
export async function aesEncrypt(plaintext: string, key: CryptoKey): Promise<string> {
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
export async function aesDecrypt(ciphertextB64: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plaintext);
}

// Flat image-input token cost per figure (vision LLM, per provider)
const IMAGE_TOKENS_PER_FIGURE: Record<string, number> = {
  openai: 85,       // detail:low is a flat 85 tokens per image
  anthropic: 700,   // ~150 DPI typical arXiv figure
  gemini: 550,
};

/** Estimate cost for one (provider, model) combination.
 *
 * When latexCharCount > 0 (collected during free-tier narration), the estimate
 * uses per-paper stats for a much more accurate input-token count.
 * Otherwise falls back to the old outputTokens * 3.0 heuristic.
 *
 * Returns predicted token counts alongside costs so the ML model path can
 * supply its own token predictions instead.
 */
export function estimateCost(
  llmProvider: string,
  llmModel: string,
  ttsProvider: string | null,
  ttsModel: string | null,
  scriptCharCount: number,
  latexCharCount: number = 0,
  figureCount: number = 0,
): { llm_input_tokens: number; llm_output_tokens: number; llm_cost: number; tts_cost: number; total_cost: number } {
  const outputTokens = scriptCharCount / 4;

  let inputTokens: number;
  if (latexCharCount > 0) {
    const textTokens = latexCharCount / 4;
    const imgTokens = figureCount * (IMAGE_TOKENS_PER_FIGURE[llmProvider] ?? 300);
    inputTokens = textTokens + imgTokens;
  } else {
    // Fallback: LaTeX input is typically ~3-5x the narration output
    inputTokens = outputTokens * 3.0;
  }

  const llmPrices = (PRICING.llm as any)[llmProvider]?.[llmModel];
  const llm_cost = llmPrices
    ? (inputTokens * llmPrices.input_per_1m_tokens + outputTokens * llmPrices.output_per_1m_tokens) / 1_000_000
    : 0;

  const ttsPrices = ttsProvider ? (PRICING.tts as any)[ttsProvider]?.[ttsModel ?? ""] : null;
  const tts_cost = ttsPrices ? (scriptCharCount * ttsPrices.per_1m_chars) / 1_000_000 : 0;

  return { llm_input_tokens: inputTokens, llm_output_tokens: outputTokens, llm_cost, tts_cost, total_cost: llm_cost + tts_cost };
}

/** Apply pricing to ML-predicted token counts. */
function costFromTokens(
  inputTokens: number,
  outputTokens: number,
  llmProvider: string,
  llmModel: string,
  ttsProvider: string | null,
  ttsModel: string | null,
  scriptCharCount: number,
): { llm_input_tokens: number; llm_output_tokens: number; llm_cost: number; tts_cost: number; total_cost: number } {
  const llmPrices = (PRICING.llm as any)[llmProvider]?.[llmModel];
  const llm_cost = llmPrices
    ? (inputTokens * llmPrices.input_per_1m_tokens + outputTokens * llmPrices.output_per_1m_tokens) / 1_000_000
    : 0;
  const ttsPrices = ttsProvider ? (PRICING.tts as any)[ttsProvider]?.[ttsModel ?? ""] : null;
  const tts_cost = ttsPrices ? (scriptCharCount * ttsPrices.per_1m_chars) / 1_000_000 : 0;
  return { llm_input_tokens: inputTokens, llm_output_tokens: outputTokens, llm_cost, tts_cost, total_cost: llm_cost + tts_cost };
}

/** Make a lightweight test call to verify an API key. Returns { valid, info? }. */
export async function validateProviderKey(
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
          model: "claude-haiku-4-5-20251001",
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
      // Validate by fetching user subscription info — works for all key types
      // and doesn't require a paid voice or credits.
      const resp = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": apiKey },
      });
      if (resp.status === 401) return { valid: false, error: "Invalid API key" };
      if (resp.ok) {
        const data = await resp.json<{ tier?: string; character_limit?: number; character_count?: number }>().catch(() => ({ tier: undefined, character_limit: undefined, character_count: undefined }));
        const remaining = (data.character_limit ?? 0) - (data.character_count ?? 0);
        if (remaining <= 0) return { valid: true, info: "Key valid (no characters remaining)" };
        return { valid: true, info: `ElevenLabs key valid (${remaining.toLocaleString()} chars remaining)` };
      }
      return { valid: false, error: `ElevenLabs returned ${resp.status}` };
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

export interface UnifiedKeyRequest {
  type: "unified";
  provider: string;        // 'openai' — handles both LLM and TTS
  encrypted_key: string;
  llm_model?: string;
  tts_model?: string;
}

export interface DualKeyRequest {
  type: "dual";
  llm_provider: string;
  encrypted_llm_key: string;
  llm_model?: string;
  tts_provider: string;
  encrypted_tts_key: string;
  tts_model?: string;
}

export interface FreeVoiceRequest {
  type: "free_voice";
  llm_provider: string;
  encrypted_llm_key: string;
  llm_model?: string;
}

export type NarratePremiumRequest = UnifiedKeyRequest | DualKeyRequest | FreeVoiceRequest;

// ─── Route handlers ──────────────────────────────────────────────────────────

/** POST /api/papers/:id/narrate-premium */
export async function handleNarratePremium(
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
    // Already narrating — tell the caller so they can show an appropriate message
    return json({ error: "This paper is already being upgraded. Please wait for it to finish." }, 409);
  }

  // Dispatch to Modal with decrypted keys (never persisted in D1)
  const dispatch = async () => {
    if (!env.MODAL_FUNCTION_URL) {
      console.log(`[local-dev] Auto-completing premium narration for ${id}`);

      // Copy base audio to versioned R2 path (simulates Modal producing a new file)
      const versionedR2Key = legacyPremiumAudioKey(id, ttsProvider ?? "free");
      const baseAudio = await env.AUDIO_BUCKET.get(legacyBaseAudioKey(id));
      if (baseAudio) {
        await env.AUDIO_BUCKET.put(versionedR2Key, baseAudio.body, {
          httpMetadata: { contentType: "audio/mpeg" },
        });
      }

      // Insert narration version + update best_version_id (same as webhook handler)
      const qualityRank = computeQualityRank(ttsProvider, ttsModel);
      const narrationTier = ttsProvider === "elevenlabs" ? "plus3" as const
        : ttsProvider === "openai" ? "plus2" as const
        : "plus1" as const;
      const version = await insertNarrationVersion(env.DB, {
        paper_id: id,
        narration_tier: narrationTier,
        quality_rank: qualityRank,
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
      // Check if a premium LLM script already exists — reuse it to skip LLM cost
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
        llm_provider: llmProvider,
        llm_api_key: llmApiKey,
        llm_model: llmModel,
        tts_provider: ttsProvider ?? "free",
        tts_api_key: ttsApiKey ?? "",
        tts_model: ttsModel ?? "",
        source_preference: "tex",
        _secret: env.MODAL_WEBHOOK_SECRET,
      };
      // Only include existing_script when we actually have one (avoids sending null)
      if (existingScript) {
        payload.existing_script = existingScript;
      }
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

interface ModelCoeffRow {
  provider_model: string;
  input_token_coeffs: string;   // JSON: [c0, c1, c2, c3] for [latex_chars, figure_count, tar_bytes, script_chars]
  input_token_intercept: number;
  output_token_coeffs: string;
  output_token_intercept: number;
  input_rmse: number;
  output_rmse: number;
  proxy_input_rmse: number;
  proxy_output_rmse: number;
  sample_count: number;
  trained_at: string;
}

function dotProduct(coeffs: number[], features: number[]): number {
  return coeffs.reduce((sum, c, i) => sum + c * (features[i] ?? 0), 0);
}

/** GET /api/papers/:id/estimate */
export async function handleEstimate(env: Env, id: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) return json({ error: "Paper not found" }, 404);

  const rawCharCount = paper.script_char_count;
  if (!rawCharCount) {
    return json({ estimated: false, message: "Script not yet generated; estimates unavailable" });
  }

  // Check if a premium LLM script already exists — use its actual length for TTS estimates
  const scriptR2Key = await findExistingPremiumScript(env.DB, id);
  const hasExistingScript = !!scriptR2Key;
  let charCount: number;
  if (scriptR2Key) {
    // Use actual script character count for accurate TTS cost
    try {
      const obj = await env.AUDIO_BUCKET.get(scriptR2Key);
      const text = obj ? await obj.text() : null;
      charCount = text ? text.length : Math.ceil(rawCharCount * 1.33);
    } catch {
      charCount = Math.ceil(rawCharCount * 1.33);
    }
  } else {
    // Estimate: AI-generated scripts from LaTeX are typically ~33% longer
    charCount = Math.ceil(rawCharCount * 1.33);
  }

  // Per-paper source stats for improved proxy formula
  const latexCharCount = paper.latex_char_count ?? 0;
  const figureCount = paper.figure_count ?? 0;
  const tarBytes = paper.tar_bytes ?? 0;

  // Load any trained ML model coefficients (Track 2)
  const mlRows = await env.DB
    .prepare("SELECT * FROM model_coefficients")
    .all<ModelCoeffRow>()
    .then(r => r.results)
    .catch(() => [] as ModelCoeffRow[]);
  const mlByProviderModel = new Map(mlRows.map(r => [r.provider_model, r]));

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
    estimate_source: "ml" | "proxy";
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

  // ML feature vector: [latex_char_count, figure_count, tar_bytes, script_char_count]
  const mlFeatures = [latexCharCount, figureCount, tarBytes, charCount];

  for (const llm of llmOptions) {
    for (const tts of ttsOptions) {
      const providerModel = `${llm.provider}:${llm.model}`;
      const mlRow = mlByProviderModel.get(providerModel);

      let costs: { llm_input_tokens: number; llm_output_tokens: number; llm_cost: number; tts_cost: number; total_cost: number };
      let estimateSource: "ml" | "proxy" = "proxy";

      if (
        mlRow &&
        mlRow.sample_count >= 5 &&
        mlRow.input_rmse < mlRow.proxy_input_rmse &&
        mlRow.output_rmse < mlRow.proxy_output_rmse
      ) {
        // Use ML-predicted token counts, apply current pricing
        const inCoeffs = JSON.parse(mlRow.input_token_coeffs) as number[];
        const outCoeffs = JSON.parse(mlRow.output_token_coeffs) as number[];
        const predInputTokens = Math.max(0, dotProduct(inCoeffs, mlFeatures) + mlRow.input_token_intercept);
        const predOutputTokens = Math.max(0, dotProduct(outCoeffs, mlFeatures) + mlRow.output_token_intercept);
        costs = costFromTokens(predInputTokens, predOutputTokens, llm.provider, llm.model, tts.provider, tts.model, charCount);
        estimateSource = "ml";
      } else {
        costs = estimateCost(llm.provider, llm.model, tts.provider, tts.model, charCount, latexCharCount, figureCount);
      }

      // If a premium script already exists, LLM generation is skipped — zero out LLM cost
      if (hasExistingScript) {
        costs.total_cost -= costs.llm_cost;
        costs.llm_cost = 0;
      }
      const quality_rank = computeQualityRank(tts.provider, tts.model);
      options.push({
        id: `${llm.provider}/${llm.model}+${tts.provider ?? "free"}/${tts.model ?? "free"}`,
        label: `${llm.label} + ${tts.label}`,
        llm_provider: llm.provider,
        llm_model: llm.model,
        tts_provider: tts.provider,
        tts_model: tts.model,
        quality_rank,
        llm_cost: costs.llm_cost,
        tts_cost: costs.tts_cost,
        total_cost: costs.total_cost,
        estimate_source: estimateSource,
      });
    }
  }

  // Sort best quality first
  options.sort((a, b) => b.quality_rank - a.quality_rank || a.total_cost - b.total_cost);

  return json({ estimated: true, script_char_count: charCount, has_existing_script: hasExistingScript, options });
}

/** GET /api/papers/:id/versions */
export async function handleGetVersions(env: Env, id: string, baseUrl: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) return json({ error: "Paper not found" }, 404);

  const versions = await getVersionsWithScores(env.DB, id);
  return json({
    versions: versions.map((v) => ({
      id: v.id,
      narration_tier: v.narration_tier,
      quality_rank: v.quality_rank,
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
      score_fidelity: v.score_fidelity ?? null,
      score_citations: v.score_citations ?? null,
      score_header: v.score_header ?? null,
      score_figures: v.score_figures ?? null,
      score_tts: v.score_tts ?? null,
      score_overall: v.score_overall ?? null,
    })),
    best_version_id: paper.best_version_id,
    is_narrating: paper.status === "narrating",
  });
}

/** POST /api/keys/encrypt */
export async function handleEncryptKey(request: Request, env: Env): Promise<Response> {
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
export async function handleValidateKey(request: Request, env: Env): Promise<Response> {
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

// ─── Admin: delete premium versions (test cleanup) ─────────────────────────

export async function handleDeletePremiumVersions(request: Request, env: Env, paperId: string): Promise<Response> {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  // Collect R2 keys for premium versions before deleting DB rows
  const versions = await env.DB
    .prepare("SELECT audio_r2_key, transcript_r2_key FROM narration_versions WHERE paper_id = ? AND narration_tier != 'base'")
    .bind(paperId)
    .all<{ audio_r2_key: string | null; transcript_r2_key: string | null }>();

  // Delete R2 objects (audio MP3s and LLM scripts)
  for (const v of versions.results) {
    if (v.audio_r2_key) {
      try { await env.AUDIO_BUCKET.delete(v.audio_r2_key); } catch {}
    }
    if (v.transcript_r2_key) {
      try { await env.AUDIO_BUCKET.delete(v.transcript_r2_key); } catch {}
    }
  }

  // Delete DB rows
  await env.DB.prepare("DELETE FROM narration_versions WHERE paper_id = ? AND narration_tier != 'base'")
    .bind(paperId)
    .run();
  // Reset best_version_id, restore original audio R2 key, and reset status if stuck narrating
  await env.DB.prepare(
    `UPDATE papers SET best_version_id = NULL, audio_r2_key = ?,
     status = CASE WHEN status = 'narrating' THEN 'narrated' ELSE status END
     WHERE id = ?`
  )
    .bind(legacyBaseAudioKey(paperId), paperId)
    .run();

  return json({ ok: true, deleted_versions: versions.results.length });
}
