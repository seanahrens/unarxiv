/**
 * Tests for lib/premiumKeys.ts — key management functions using localStorage.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  storeEncryptedKey,
  getStoredKeys,
  getStoredKey,
  hasStoredKeys,
  hasKeyForProvider,
  clearKeys,
  getLastOption,
  setLastOption,
  getPremiumDataForSync,
  mergePremiumDataFromSync,
  type PremiumProvider,
} from "../lib/premiumKeys";

// jsdom provides localStorage; reset it before each test
beforeEach(() => {
  localStorage.clear();
});

// ─── storeEncryptedKey / getStoredKey / getStoredKeys ─────────────────────────

describe("storeEncryptedKey", () => {
  it("stores an encrypted key for a provider", () => {
    storeEncryptedKey("openai", "enc-key-abc");
    expect(getStoredKey("openai")).toBe("enc-key-abc");
  });

  it("overwrites an existing key for the same provider", () => {
    storeEncryptedKey("openai", "first-key");
    storeEncryptedKey("openai", "second-key");
    expect(getStoredKey("openai")).toBe("second-key");
  });

  it("stores keys independently per provider", () => {
    storeEncryptedKey("openai", "openai-key");
    storeEncryptedKey("elevenlabs", "el-key");
    expect(getStoredKey("openai")).toBe("openai-key");
    expect(getStoredKey("elevenlabs")).toBe("el-key");
  });
});

describe("getStoredKey", () => {
  it("returns null when no key is stored for a provider", () => {
    expect(getStoredKey("openai")).toBeNull();
  });

  it("returns the stored key after storing", () => {
    storeEncryptedKey("google", "goog-enc-key");
    expect(getStoredKey("google")).toBe("goog-enc-key");
  });
});

describe("getStoredKeys", () => {
  it("returns empty object when nothing is stored", () => {
    expect(getStoredKeys()).toEqual({});
  });

  it("returns all stored provider keys", () => {
    storeEncryptedKey("openai", "k1");
    storeEncryptedKey("azure", "k2");
    const keys = getStoredKeys();
    expect(keys.openai).toBe("k1");
    expect(keys.azure).toBe("k2");
    expect(Object.keys(keys)).toHaveLength(2);
  });
});

// ─── hasStoredKeys / hasKeyForProvider ────────────────────────────────────────

describe("hasStoredKeys", () => {
  it("returns false when nothing is stored", () => {
    expect(hasStoredKeys()).toBe(false);
  });

  it("returns true when at least one key is stored", () => {
    storeEncryptedKey("openai", "k");
    expect(hasStoredKeys()).toBe(true);
  });

  it("returns false after all keys are cleared", () => {
    storeEncryptedKey("openai", "k");
    clearKeys();
    expect(hasStoredKeys()).toBe(false);
  });
});

describe("hasKeyForProvider", () => {
  it("returns false for a provider without a key", () => {
    expect(hasKeyForProvider("elevenlabs")).toBe(false);
  });

  it("returns true after storing a key for that provider", () => {
    storeEncryptedKey("elevenlabs", "el-key");
    expect(hasKeyForProvider("elevenlabs")).toBe(true);
  });

  it("returns false for other providers when only one is stored", () => {
    storeEncryptedKey("openai", "k");
    expect(hasKeyForProvider("anthropic")).toBe(false);
    expect(hasKeyForProvider("elevenlabs")).toBe(false);
  });
});

// ─── clearKeys ────────────────────────────────────────────────────────────────

describe("clearKeys", () => {
  it("clears a specific provider's key", () => {
    storeEncryptedKey("openai", "k1");
    storeEncryptedKey("google", "k2");
    clearKeys("openai");
    expect(getStoredKey("openai")).toBeNull();
    expect(getStoredKey("google")).toBe("k2");
  });

  it("clears all keys when no provider is specified", () => {
    storeEncryptedKey("openai", "k1");
    storeEncryptedKey("google", "k2");
    clearKeys();
    expect(hasStoredKeys()).toBe(false);
  });

  it("does nothing if the provider had no key", () => {
    storeEncryptedKey("openai", "k");
    clearKeys("elevenlabs"); // doesn't exist — should not throw
    expect(getStoredKey("openai")).toBe("k");
  });
});

// ─── getLastOption / setLastOption ────────────────────────────────────────────

describe("getLastOption / setLastOption", () => {
  it("returns null when no option has been set", () => {
    expect(getLastOption()).toBeNull();
  });

  it("persists the last selected option", () => {
    setLastOption("openai/gpt-4o+openai/tts-1-hd");
    expect(getLastOption()).toBe("openai/gpt-4o+openai/tts-1-hd");
  });

  it("overwrites the previous option", () => {
    setLastOption("first-option");
    setLastOption("second-option");
    expect(getLastOption()).toBe("second-option");
  });
});

// ─── getPremiumDataForSync ────────────────────────────────────────────────────

describe("getPremiumDataForSync", () => {
  it("returns object with keys and lastOption fields", () => {
    const data = getPremiumDataForSync();
    expect(data).toHaveProperty("keys");
    expect(data).toHaveProperty("lastOption");
  });

  it("reflects currently stored state", () => {
    storeEncryptedKey("openai", "enc123");
    setLastOption("openai/gpt-4o+free");
    const data = getPremiumDataForSync();
    expect(data.keys.openai).toBe("enc123");
    expect(data.lastOption).toBe("openai/gpt-4o+free");
  });
});

// ─── mergePremiumDataFromSync ─────────────────────────────────────────────────

describe("mergePremiumDataFromSync", () => {
  it("adds missing keys from incoming data", () => {
    const incoming = {
      keys: { openai: "remote-key" },
      lastOption: "openai/gpt-4o+free",
    };
    mergePremiumDataFromSync(incoming);
    expect(getStoredKey("openai")).toBe("remote-key");
    expect(getLastOption()).toBe("openai/gpt-4o+free");
  });

  it("does NOT overwrite existing keys with incoming keys", () => {
    storeEncryptedKey("openai", "local-key");
    mergePremiumDataFromSync({
      keys: { openai: "remote-key" },
      lastOption: null,
    });
    // Local key takes precedence
    expect(getStoredKey("openai")).toBe("local-key");
  });

  it("does NOT overwrite existing lastOption with incoming", () => {
    setLastOption("local-option");
    mergePremiumDataFromSync({ keys: {}, lastOption: "remote-option" });
    expect(getLastOption()).toBe("local-option");
  });

  it("merges new keys without touching existing ones", () => {
    storeEncryptedKey("openai", "existing-openai");
    mergePremiumDataFromSync({
      keys: { openai: "ignore-this", elevenlabs: "new-el-key" },
      lastOption: null,
    });
    expect(getStoredKey("openai")).toBe("existing-openai");
    expect(getStoredKey("elevenlabs")).toBe("new-el-key");
  });

  it("handles null/undefined input gracefully", () => {
    expect(() => mergePremiumDataFromSync(null)).not.toThrow();
    expect(() => mergePremiumDataFromSync(undefined)).not.toThrow();
    expect(() => mergePremiumDataFromSync("string")).not.toThrow();
    expect(() => mergePremiumDataFromSync(42)).not.toThrow();
  });

  it("handles malformed incoming data gracefully", () => {
    expect(() => mergePremiumDataFromSync({ keys: "not-an-object" })).not.toThrow();
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("unarxiv_premium_keys", "}{invalid json");
    // Should not throw — falls back to empty state
    expect(() => getStoredKeys()).not.toThrow();
    expect(getStoredKeys()).toEqual({});
  });
});

// ─── Persistence across calls ─────────────────────────────────────────────────

describe("Persistence (multiple calls read same localStorage)", () => {
  it("changes made by storeEncryptedKey are visible to getStoredKey", () => {
    storeEncryptedKey("polly", "polly-enc");
    // Second read should reflect what was written
    expect(getStoredKey("polly")).toBe("polly-enc");
    expect(hasKeyForProvider("polly")).toBe(true);
  });

  it("all functions handle missing localStorage gracefully", () => {
    // Simulate missing localStorage item (already cleared in beforeEach)
    expect(getStoredKeys()).toEqual({});
    expect(getLastOption()).toBeNull();
    expect(hasStoredKeys()).toBe(false);
    expect(hasKeyForProvider("openai")).toBe(false);
  });
});
