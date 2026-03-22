/**
 * Shared utilities for working with narration versions.
 *
 * Centralizes the "is this an upgrade?" predicate, version filtering,
 * and tier-mapping logic that was previously duplicated across
 * PaperPageContent, ScriptPageContent, PaperActionsMenu,
 * PremiumNarrationModal, and voiceTiers.
 */

import type { PaperVersion } from "./api";
import { VOICE_TIERS, type VoiceTier } from "./voiceTiers";

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
