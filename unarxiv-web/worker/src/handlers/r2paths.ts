/**
 * Centralized R2 storage key conventions.
 *
 * Base (free) narrations use flat keys: audio/{id}.mp3
 * Premium versions use versioned keys: audio/{id}/v{versionId}.mp3
 */

/** R2 key for the base (free) audio file. */
export function baseAudioKey(arxivId: string): string {
  return `audio/${arxivId}.mp3`;
}

/** R2 key for a versioned (premium) audio file. */
export function versionedAudioKey(arxivId: string, versionId: string): string {
  return `audio/${arxivId}/v${versionId}.mp3`;
}

/** R2 key for the base (free) transcript. */
export function baseTranscriptKey(arxivId: string): string {
  return `transcripts/${arxivId}.txt`;
}

/** R2 key for a versioned (premium) transcript. */
export function versionedTranscriptKey(arxivId: string, versionId: string): string {
  return `transcripts/${arxivId}/v${versionId}.txt`;
}

/** Legacy premium audio key format (used during early development). */
export function legacyPremiumAudioKey(arxivId: string, ttsProvider: string): string {
  return `audio/${arxivId}/premium-${ttsProvider}.mp3`;
}
