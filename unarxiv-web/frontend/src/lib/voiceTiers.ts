/**
 * Voice quality tier definitions — shared across the app.
 *
 * Each tier maps to a TTS provider (or "free" for the improved-script upgrade,
 * or "base" for the default narration).
 * Used in the upgrade modal, rating modal, admin panel, play button, etc.
 */

export interface VoiceTier {
  /** Identifier matching option_id / tts_provider values */
  id: string;
  /** User-facing label (e.g. "Most Lifelike Voice") */
  label: string;
  /** Description with the label integrated as the opening phrase */
  description: string;
  /** TTS provider display name */
  providerName: string;
  /** Quality rank for ordering (higher = better) */
  rank: number;
  /** Number of plus icons (0 = base, 1–3 = upgrade tiers) */
  plusCount: 0 | 1 | 2 | 3;
}

export const VOICE_TIERS: Record<string, VoiceTier> = {
  elevenlabs: {
    id: "elevenlabs",
    label: "Most Lifelike Voice",
    description: "Most Lifelike Voice. Nearly human.",
    providerName: "ElevenLabs",
    rank: 4,
    plusCount: 3,
  },
  openai: {
    id: "openai",
    label: "Polished Voice",
    description: "Polished Voice. Expressive. Pleasant.",
    providerName: "OpenAI",
    rank: 3,
    plusCount: 2,
  },
  free: {
    id: "free",
    label: "Basic Voice",
    description: "Basic Voice. Decent. A tinge botty.",
    providerName: "Microsoft",
    rank: 2,
    plusCount: 1,
  },
  base: {
    id: "base",
    label: "Basic Voice",
    description: "Basic Voice. The default narration with no upgrades applied.",
    providerName: "Microsoft",
    rank: 1,
    plusCount: 0,
  },
};

/** Ordered tiers from best to worst */
export const VOICE_TIERS_ORDERED: VoiceTier[] = [
  VOICE_TIERS.elevenlabs,
  VOICE_TIERS.openai,
  VOICE_TIERS.free,
  VOICE_TIERS.base,
];

/**
 * Resolve a voice tier from a tts_provider string.
 * Falls back to the "base" tier for null/unknown providers.
 */
export function getTierFromProvider(ttsProvider: string | null): VoiceTier {
  if (ttsProvider && VOICE_TIERS[ttsProvider]) return VOICE_TIERS[ttsProvider];
  return VOICE_TIERS.base;
}

/**
 * Resolve a voice tier from a voice_tier string stored in the DB.
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
  versions: { tts_provider: string | null; version_type: string; quality_rank: number }[]
): VoiceTier {
  let best: VoiceTier = VOICE_TIERS.base;
  for (const v of versions) {
    if (v.version_type === "free" && v.quality_rank === 0) continue; // base narration
    const tier = getTierFromProvider(v.tts_provider);
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
