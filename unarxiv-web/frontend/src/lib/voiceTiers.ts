/**
 * Voice quality tier definitions — shared across the app.
 *
 * Tier IDs use the plus-count convention (base, plus1, plus2, plus3) for
 * structural identity. Voice names (Aria, Eric, Onyx, Will) are internal-only
 * and can change independently. Provider names map to TTS API providers.
 *
 * Used in the upgrade modal, rating modal, admin panel, play button, etc.
 */

export interface VoiceTier {
  /** Structural tier identifier: "base" | "plus1" | "plus2" | "plus3" */
  id: string;
  /** User-facing label (e.g. "Most Lifelike Voice") */
  label: string;
  /** Description with the label integrated as the opening phrase */
  description: string;
  /** TTS provider display name */
  providerName: string;
  /** Internal voice persona name (not user-facing) */
  voiceName: string;
  /** Quality rank for ordering (higher = better) */
  rank: number;
  /** Number of plus icons (0 = base, 1–3 = upgrade tiers) */
  plusCount: 0 | 1 | 2 | 3;
  /** Shortened description for mobile (after the lead phrase period) */
  shortDescription: string;
  /** Estimated TTS processing seconds per 1K characters (for time estimates in UI) */
  secsPerKChar: number;
}

export const VOICE_TIERS: Record<string, VoiceTier> = {
  plus3: {
    id: "plus3",
    label: "Most Lifelike Voice",
    description: "Most Lifelike Voice. Nearly human.",
    shortDescription: "Most Lifelike Voice.",
    providerName: "ElevenLabs",
    voiceName: "Will",
    rank: 4,
    plusCount: 3,
    secsPerKChar: 3.0,    // 15s per 5000-char chunk
  },
  plus2: {
    id: "plus2",
    label: "Polished Voice",
    description: "Polished Voice. Expressive. Pleasant.",
    shortDescription: "Polished Voice. Expressive.",
    providerName: "OpenAI",
    voiceName: "Onyx",
    rank: 3,
    plusCount: 2,
    secsPerKChar: 10.0,   // 20s per 2000-char chunk
  },
  plus1: {
    id: "plus1",
    label: "Basic Voice",
    description: "Basic Voice. Decent. A tinge botty.",
    shortDescription: "Basic Voice. Decent.",
    providerName: "Microsoft",
    voiceName: "Eric",
    rank: 2,
    plusCount: 1,
    secsPerKChar: 1.25,   // 5s per 4000-char chunk
  },
  base: {
    id: "base",
    label: "Basic Voice",
    description: "Basic Voice. The default narration with no upgrades applied.",
    shortDescription: "Basic Voice.",
    providerName: "Microsoft",
    voiceName: "Guy",
    rank: 1,
    plusCount: 0,
    secsPerKChar: 1.25,
  },
};

/** Ordered tiers from best to worst */
export const VOICE_TIERS_ORDERED: VoiceTier[] = [
  VOICE_TIERS.plus3,
  VOICE_TIERS.plus2,
  VOICE_TIERS.plus1,
  VOICE_TIERS.base,
];

/**
 * Map from TTS provider name (as stored in DB tts_provider column) to tier ID.
 * The DB stores provider names; we translate to structural tier IDs.
 */
const PROVIDER_TO_TIER: Record<string, string> = {
  elevenlabs: "plus3",
  openai: "plus2",
  free: "plus1",
};

/**
 * Resolve a voice tier from a tts_provider string.
 * Falls back to the "base" tier for null/unknown providers.
 */
export function getTierFromProvider(ttsProvider: string | null): VoiceTier {
  if (ttsProvider) {
    const tierId = PROVIDER_TO_TIER[ttsProvider];
    if (tierId) return VOICE_TIERS[tierId];
  }
  return VOICE_TIERS.base;
}

/**
 * Resolve a voice tier from a tier ID string (e.g. from DB voice_tier column).
 * Falls back to "base" for null/unknown.
 */
export function getTierFromId(tierId: string | null): VoiceTier {
  if (tierId && VOICE_TIERS[tierId]) return VOICE_TIERS[tierId];
  return VOICE_TIERS.base;
}

/**
 * Determine the best (highest) voice tier for a paper given its narration versions.
 * Returns the "base" tier if no upgraded versions exist.
 */
export function getBestTierFromVersions(
  versions: { narration_tier: string; quality_rank: number }[]
): VoiceTier {
  let best: VoiceTier = VOICE_TIERS.base;
  for (const v of versions) {
    if (v.narration_tier === "base") continue; // skip base narrations
    const tier = VOICE_TIERS[v.narration_tier] ?? VOICE_TIERS.base;
    if (tier.rank > best.rank) {
      best = tier;
    }
  }
  return best;
}

/**
 * Format the tier for display in the review UI.
 * e.g. "Most Lifelike Voice (ElevenLabs)"
 */
export function formatTierForReview(tier: VoiceTier): string {
  return `${tier.label} (${tier.providerName})`;
}

/**
 * Estimate total processing time for an upgrade narration.
 * Includes LLM script generation (~4s per 1K chars) + TTS synthesis.
 * LLM typically expands script by ~33%, so TTS gets ~1.33x the char count.
 *
 * Returns seconds. Pass `hasExistingScript=true` to skip LLM time.
 */
export function estimateProcessingSeconds(
  tier: VoiceTier,
  scriptCharCount: number,
  hasExistingScript: boolean = false,
): number {
  const LLM_SECS_PER_K_CHAR = 4; // ~1 token per 4 chars, ~60 tok/s
  const LLM_EXPANSION = 1.33;    // LLM scripts are ~33% longer

  const llmTime = hasExistingScript ? 0 : scriptCharCount * LLM_SECS_PER_K_CHAR / 1000;
  const ttsCharCount = scriptCharCount * LLM_EXPANSION;
  const ttsTime = ttsCharCount * tier.secsPerKChar / 1000;
  return Math.round(llmTime + ttsTime);
}

/**
 * Format seconds as "~X min" for display, rounded to nearest minute.
 */
export function formatProcessingTime(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `~${mins} min`;
}
