/**
 * Shared utilities for working with narration versions.
 *
 * Centralizes the "is this an upgrade?" predicate, version filtering,
 * and tier-mapping logic that was previously duplicated across
 * PaperPageContent, ScriptPageContent, PaperActionsMenu,
 * UpgradeNarrationModal, and voiceTiers.
 */

import type { PaperVersion } from "./api";
import { VOICE_TIERS, type VoiceTier } from "./voiceTiers";

/**
 * LLM model ID → short display name mapping.
 * Handles common Anthropic and OpenAI model IDs.
 */
const LLM_DISPLAY_NAMES: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-3-5-haiku-20241022": "Haiku 3.5",
  "claude-sonnet-4-5-20250514": "Sonnet 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
};

/**
 * Format an LLM model ID into a short, user-friendly display name.
 * Returns "Programmatic" for null (base/regex scripts with no LLM).
 */
export function formatLlmModel(llmModel: string | null): string {
  if (!llmModel) return "Programmatic";
  if (LLM_DISPLAY_NAMES[llmModel]) return LLM_DISPLAY_NAMES[llmModel];
  // Fallback: try partial matching for versioned Anthropic models
  if (llmModel.startsWith("claude-haiku-4-5")) return "Haiku 4.5";
  if (llmModel.startsWith("claude-3-5-haiku")) return "Haiku 3.5";
  if (llmModel.startsWith("claude-sonnet-4-5")) return "Sonnet 4.5";
  if (llmModel.startsWith("claude-sonnet-4-6")) return "Sonnet 4.6";
  if (llmModel.startsWith("claude-sonnet-4-")) return "Sonnet 4";
  if (llmModel.startsWith("claude-opus-4-")) return "Opus 4";
  if (llmModel.startsWith("gpt-4o-mini")) return "GPT-4o Mini";
  if (llmModel.startsWith("gpt-4o")) return "GPT-4o";
  // Last resort: return the raw model ID
  return llmModel;
}

/**
 * Format the LLM provider name for display.
 */
export function formatLlmProvider(llmProvider: string | null): string {
  if (!llmProvider) return "";
  const providers: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
  };
  return providers[llmProvider] ?? llmProvider;
}

/**
 * True for any narration that represents an upgrade over the default base
 * narration (upgraded TTS, LLM-improved script, or both).
 *
 * Base narrations have narration_tier="base".
 * Upgraded versions have narration_tier="plus1" | "plus2" | "plus3".
 */
export function isUpgradedVersion(v: Pick<PaperVersion, "narration_tier">): boolean {
  return v.narration_tier !== "base";
}

/**
 * Filter to only upgraded (non-base) versions, sorted by quality_rank
 * descending (best first).
 */
export function getUpgradedVersions(versions: PaperVersion[]): PaperVersion[] {
  return versions
    .filter(isUpgradedVersion)
    .sort((a, b) => b.quality_rank - a.quality_rank);
}

/**
 * Best version per voice tier — used for the "Other Narrations" submenu.
 * Includes ALL tiers with audio (base + upgraded).
 */
export function getBestVersionPerTier(versions: PaperVersion[]): Map<string, PaperVersion> {
  const byTier = new Map<string, PaperVersion>();
  for (const v of versions) {
    if (!v.audio_url) continue;
    const tier = VOICE_TIERS[v.narration_tier] ?? VOICE_TIERS.base;
    const existing = byTier.get(tier.id);
    if (!existing || v.quality_rank > existing.quality_rank) {
      byTier.set(tier.id, v);
    }
  }
  return byTier;
}

/**
 * Determine the highest completed voice tier rank from a set of versions.
 * Returns 0 if no upgraded versions exist.
 *
 * Used for cascading disable logic in the upgrade modal:
 * e.g., if plus3 (rank 4) is completed, all lower tiers are disabled.
 */
export function getHighestCompletedTierRank(versions: PaperVersion[]): number {
  let highest = 0;
  for (const v of versions) {
    if (!isUpgradedVersion(v)) continue;
    const tier = resolveTierForVersion(v);
    if (tier.rank > highest) highest = tier.rank;
  }
  return highest;
}

/**
 * Resolve a PaperVersion to its VoiceTier.
 * Since narration_tier directly encodes the tier, we just look it up.
 * Falls back to base tier for unknown values.
 */
export function resolveTierForVersion(v: Pick<PaperVersion, "narration_tier">): VoiceTier {
  return VOICE_TIERS[v.narration_tier] ?? VOICE_TIERS.base;
}
