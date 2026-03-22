/**
 * Tests for POST /api/keys/encrypt and POST /api/keys/validate.
 */
import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { initDb } from "./helpers";

beforeAll(async () => {
  await initDb();
});

// Helper: encrypt a key via the API
async function encryptKey(provider: string, key: string): Promise<{ encrypted_key: string; provider: string }> {
  const resp = await SELF.fetch("http://localhost/api/keys/encrypt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, provider }),
  });
  expect(resp.status).toBe(200);
  return resp.json();
}

describe("POST /api/keys/encrypt", () => {
  it("encrypts a valid OpenAI key", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/encrypt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sk-testkey123", provider: "openai" }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.encrypted_key).toBeTypeOf("string");
    expect(body.encrypted_key.length).toBeGreaterThan(20);
    expect(body.provider).toBe("openai");
  });

  it("rejects missing key field", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/encrypt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "openai" }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/key/);
  });

  it("rejects missing provider field", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/encrypt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sk-test" }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/provider/);
  });

  it("rejects invalid provider name", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/encrypt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sk-test", provider: "notaprovider" }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/provider/);
  });

  it("rejects invalid JSON body", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/encrypt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(resp.status).toBe(400);
  });

  it("produces different ciphertexts for the same key (random IV)", async () => {
    const r1 = await encryptKey("openai", "sk-same-key");
    const r2 = await encryptKey("openai", "sk-same-key");
    // AES-GCM uses random IV so ciphertexts must differ
    expect(r1.encrypted_key).not.toBe(r2.encrypted_key);
  });

  it("encrypts keys for all valid providers", async () => {
    for (const provider of ["openai", "anthropic", "elevenlabs", "google"]) {
      const resp = await SELF.fetch("http://localhost/api/keys/encrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "sk-test", provider }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json() as any;
      expect(body.provider).toBe(provider);
    }
  });
});

describe("POST /api/keys/validate", () => {
  it("returns valid:false for corrupted encrypted_key", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        encrypted_key: "definitely-not-valid-base64-ciphertext==",
        provider: "openai",
      }),
    });
    // Either 400 (decrypt failure) or 200 with valid:false
    const body = await resp.json() as any;
    expect(body.valid).toBe(false);
  });

  it("rejects missing encrypted_key", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "openai" }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/encrypted_key/);
  });

  it("rejects missing provider", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted_key: "abc123" }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/provider/);
  });

  it("rejects invalid JSON body", async () => {
    const resp = await SELF.fetch("http://localhost/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });
    expect(resp.status).toBe(400);
  });
});

describe("Encrypt → Validate roundtrip", () => {
  it("a key encrypted by /encrypt decrypts successfully in /validate", async () => {
    // Encrypt a key first
    const encResp = await SELF.fetch("http://localhost/api/keys/encrypt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "sk-openai-roundtrip-test", provider: "openai" }),
    });
    expect(encResp.status).toBe(200);
    const { encrypted_key } = await encResp.json() as { encrypted_key: string };

    // Validate — the validate endpoint will attempt to make an external API call
    // which will fail in tests, but the decryption itself should succeed
    const valResp = await SELF.fetch("http://localhost/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted_key, provider: "openai" }),
    });
    // The response should not be a decryption failure (400)
    // It will be 200 with valid:false/true (OpenAI call fails in test env)
    expect(valResp.status).toBe(200);
    const body = await valResp.json() as any;
    // valid field must be boolean (true or false — depends on network)
    expect(typeof body.valid).toBe("boolean");
    // No decryption error
    expect(body.error).not.toMatch(/decrypt/);
  });
});
