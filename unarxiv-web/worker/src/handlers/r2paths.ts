/**
 * Centralized R2 storage key conventions.
 *
 * All narrations (base and upgrade) now use versioned keys.
 * Legacy flat keys are kept for backward-compatible reads of pre-versioning objects.
 */

/** @deprecated Legacy flat path — backward-compat reads of pre-versioning narrations only. */
export function legacyBaseAudioKey(arxivId: string): string {
  return `audio/${arxivId}.mp3`;
}

/** R2 key for a versioned audio file (base or upgrade). */
export function versionedAudioKey(arxivId: string, versionId: string): string {
  return `audio/${arxivId}/v${versionId}.mp3`;
}

/** @deprecated Legacy flat path — backward-compat reads of pre-versioning narrations only. */
export function legacyBaseTranscriptKey(arxivId: string): string {
  return `transcripts/${arxivId}.txt`;
}

/** R2 key for a versioned transcript (base or upgrade). */
export function versionedTranscriptKey(arxivId: string, versionId: string): string {
  return `transcripts/${arxivId}/v${versionId}.txt`;
}

/** Legacy upgrade audio key format (used during early development). */
export function legacyUpgradeAudioKey(arxivId: string, ttsProvider: string): string {
  return `audio/${arxivId}/premium-${ttsProvider}.mp3`;
}
