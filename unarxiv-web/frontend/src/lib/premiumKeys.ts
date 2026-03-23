/**
 * Premium narration key management.
 *
 * Encrypted API keys are stored in localStorage under `unarxiv_premium_keys`.
 * The actual encryption is performed server-side via POST /api/keys/encrypt —
 * the browser only ever stores the opaque ciphertext returned by the server.
 *
 * Shape stored:
 *   {
 *     keys: { [provider]: string },   // provider → encrypted ciphertext
 *     lastOption: string | null        // last selected premium option id
 *   }
 */

const STORAGE_KEY = "unarxiv_premium_keys";

export type PremiumProvider =
  | "openai"
  | "google"
  | "elevenlabs"
  | "anthropic"
  | "polly"
  | "azure"
  | "free"; // unarXiv Voice (LLM-only)

interface StoredPremiumData {
  keys: Partial<Record<PremiumProvider, string>>;
  lastOption: string | null;
  defaultScriptingProvider: string | null;
}

function readStorage(): StoredPremiumData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { keys: {}, lastOption: null, defaultScriptingProvider: null };
    const parsed = JSON.parse(raw) as StoredPremiumData;
    // Backfill for older storage shape
    if (!("defaultScriptingProvider" in parsed)) (parsed as StoredPremiumData).defaultScriptingProvider = null;
    return parsed;
  } catch {
    return { keys: {}, lastOption: null, defaultScriptingProvider: null };
  }
}

function writeStorage(data: StoredPremiumData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Store an encrypted key for a given provider.
 * `encryptedKey` is the opaque ciphertext returned by POST /api/keys/encrypt.
 */
export function storeEncryptedKey(provider: PremiumProvider, encryptedKey: string): void {
  const data = readStorage();
  data.keys[provider] = encryptedKey;
  writeStorage(data);
}

/**
 * Returns a map of provider → encrypted key for all stored providers.
 */
export function getStoredKeys(): Partial<Record<PremiumProvider, string>> {
  return readStorage().keys;
}

/**
 * Returns the encrypted key for a given provider, or null if not stored.
 */
export function getStoredKey(provider: PremiumProvider): string | null {
  return readStorage().keys[provider] ?? null;
}

/**
 * Returns true if the user has at least one API key stored.
 */
export function hasStoredKeys(): boolean {
  const keys = readStorage().keys;
  return Object.keys(keys).length > 0;
}

/**
 * Returns true if the user has a key stored for this specific provider.
 */
export function hasKeyForProvider(provider: PremiumProvider): boolean {
  return !!readStorage().keys[provider];
}

/**
 * Remove a single provider's key, or all keys if no provider is specified.
 */
export function clearKeys(provider?: PremiumProvider): void {
  const data = readStorage();
  if (provider) {
    delete data.keys[provider];
  } else {
    data.keys = {};
  }
  writeStorage(data);
}

/**
 * Retrieve the last selected premium narration option id (e.g. "openai", "elevenlabs").
 */
export function getLastOption(): string | null {
  return readStorage().lastOption;
}

/**
 * Persist the last selected premium narration option id.
 */
export function setLastOption(option: string): void {
  const data = readStorage();
  data.lastOption = option;
  writeStorage(data);
}

/**
 * Returns the default scripting (LLM) provider id, or null if not set.
 */
export function getDefaultScriptingProvider(): string | null {
  return readStorage().defaultScriptingProvider;
}

/**
 * Persist the user's preferred default scripting (LLM) provider.
 */
export function setDefaultScriptingProvider(provider: string | null): void {
  const data = readStorage();
  data.defaultScriptingProvider = provider;
  writeStorage(data);
}

/**
 * Returns the full stored premium data for inclusion in sync payloads.
 * Callers should treat this as opaque JSON — keys are already encrypted.
 */
export function getPremiumDataForSync(): StoredPremiumData {
  return readStorage();
}

/**
 * Merge incoming premium data from a sync payload.
 * Existing keys take precedence (don't overwrite with stale data).
 */
export function mergePremiumDataFromSync(incoming: unknown): void {
  if (!incoming || typeof incoming !== "object") return;
  const data = incoming as Partial<StoredPremiumData>;
  const current = readStorage();
  if (data.keys && typeof data.keys === "object") {
    // Merge: don't overwrite existing keys, only fill gaps
    for (const [provider, key] of Object.entries(data.keys)) {
      if (key && !current.keys[provider as PremiumProvider]) {
        current.keys[provider as PremiumProvider] = key;
      }
    }
  }
  if (data.lastOption && !current.lastOption) {
    current.lastOption = data.lastOption;
  }
  writeStorage(current);
}
