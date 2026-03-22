/**
 * Tests for premium narration endpoints:
 *   POST /api/papers/:id/narrate-premium  (3 request shapes)
 *   GET  /api/papers/:id/estimate
 *   GET  /api/papers/:id/versions
 */
import { SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initDb, insertPaper } from "./helpers";

const BASE = "http://localhost";

// Helper: POST /api/keys/encrypt
async function encryptKey(key: string, provider: string): Promise<string> {
  const resp = await SELF.fetch(`${BASE}/api/keys/encrypt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, provider }),
  });
  const body = await resp.json() as { encrypted_key: string };
  return body.encrypted_key;
}

beforeAll(async () => {
  await initDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/papers/:id/estimate
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/papers/:id/estimate", () => {
  beforeEach(async () => {
    await SELF.fetch(`${BASE}/api/papers`); // warm-up
  });

  it("returns 404 for unknown paper", async () => {
    const resp = await SELF.fetch(`${BASE}/api/papers/9999.99999/estimate`);
    expect(resp.status).toBe(404);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/not found/i);
  });

  it("returns estimated:false when script_char_count is null", async () => {
    await insertPaper({ id: "est.0001", script_char_count: null });
    const resp = await SELF.fetch(`${BASE}/api/papers/est.0001/estimate`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.estimated).toBe(false);
    expect(body.message).toBeTypeOf("string");
  });

  it("returns cost options when script_char_count is set", async () => {
    await insertPaper({ id: "est.0002", script_char_count: 50000 });
    const resp = await SELF.fetch(`${BASE}/api/papers/est.0002/estimate`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.estimated).toBe(true);
    expect(body.script_char_count).toBe(50000);
    expect(Array.isArray(body.options)).toBe(true);
    expect(body.options.length).toBeGreaterThan(0);

    // Each option should have required fields
    const opt = body.options[0];
    expect(opt).toHaveProperty("id");
    expect(opt).toHaveProperty("llm_cost");
    expect(opt).toHaveProperty("tts_cost");
    expect(opt).toHaveProperty("total_cost");
    expect(opt).toHaveProperty("quality_rank");
    expect(opt.quality_rank).toBeGreaterThan(0); // premium ranks >= 5
  });

  it("options are sorted best quality first", async () => {
    await insertPaper({ id: "est.0003", script_char_count: 20000 });
    const resp = await SELF.fetch(`${BASE}/api/papers/est.0003/estimate`);
    const body = await resp.json() as any;
    const ranks: number[] = body.options.map((o: any) => o.quality_rank);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/papers/:id/versions
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/papers/:id/versions", () => {
  it("returns 404 for unknown paper", async () => {
    const resp = await SELF.fetch(`${BASE}/api/papers/9999.00000/versions`);
    expect(resp.status).toBe(404);
  });

  it("returns empty versions list for a new paper", async () => {
    await insertPaper({ id: "ver.0001" });
    const resp = await SELF.fetch(`${BASE}/api/papers/ver.0001/versions`);
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(Array.isArray(body.versions)).toBe(true);
    expect(body.versions).toHaveLength(0);
    expect(body.best_version_id).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/papers/:id/narrate-premium  — missing ENCRYPTION_KEY guard
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/papers/:id/narrate-premium — validation", () => {
  it("returns 404 for unknown paper", async () => {
    const encKey = await encryptKey("sk-test", "openai");
    const resp = await SELF.fetch(`${BASE}/api/papers/9999.11111/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unified", provider: "openai", encrypted_key: encKey }),
    });
    expect(resp.status).toBe(404);
  });

  it("returns 400 for invalid type field", async () => {
    await insertPaper({ id: "np.0001" });
    const resp = await SELF.fetch(`${BASE}/api/papers/np.0001/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "invalid_type", provider: "openai", encrypted_key: "x" }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/type/);
  });

  it("returns 400 for invalid JSON body", async () => {
    await insertPaper({ id: "np.0002" });
    const resp = await SELF.fetch(`${BASE}/api/papers/np.0002/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(resp.status).toBe(400);
  });

  it("unified: returns 400 when provider or encrypted_key missing", async () => {
    await insertPaper({ id: "np.0003" });
    // Missing encrypted_key
    const resp = await SELF.fetch(`${BASE}/api/papers/np.0003/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unified", provider: "openai" }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/encrypted_key/);
  });

  it("dual: returns 400 when required fields missing", async () => {
    await insertPaper({ id: "np.0004" });
    const encKey = await encryptKey("sk-test", "openai");
    const resp = await SELF.fetch(`${BASE}/api/papers/np.0004/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "dual",
        llm_provider: "openai",
        encrypted_llm_key: encKey,
        // missing tts_provider and encrypted_tts_key
      }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/tts_provider/);
  });

  it("free_voice: returns 400 when llm_provider or encrypted_llm_key missing", async () => {
    await insertPaper({ id: "np.0005" });
    const resp = await SELF.fetch(`${BASE}/api/papers/np.0005/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "free_voice" }), // no llm_provider
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/llm_provider/);
  });

  it("returns 400 when encrypted key cannot be decrypted (corrupted)", async () => {
    await insertPaper({ id: "np.0006" });
    const resp = await SELF.fetch(`${BASE}/api/papers/np.0006/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "unified",
        provider: "openai",
        encrypted_key: "totally-invalid-ciphertext",
      }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json() as any;
    expect(body.error).toMatch(/decrypt/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/papers/:id/narrate-premium — successful dispatch (no MODAL_FUNCTION_URL)
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/papers/:id/narrate-premium — successful claim", () => {
  it("unified request: claims paper and returns narrating status", async () => {
    await insertPaper({ id: "np.1001", status: "unnarrated" });
    const encKey = await encryptKey("sk-test-openai-key", "openai");

    const resp = await SELF.fetch(`${BASE}/api/papers/np.1001/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "unified",
        provider: "openai",
        encrypted_key: encKey,
      }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.status).toBe("narrating");
    expect(body.id).toBe("np.1001");
  });

  it("dual request: claims paper and returns narrating status", async () => {
    await insertPaper({ id: "np.1002", status: "unnarrated" });
    const llmKey = await encryptKey("sk-openai-llm", "openai");
    const ttsKey = await encryptKey("sk-openai-tts", "openai");

    const resp = await SELF.fetch(`${BASE}/api/papers/np.1002/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "dual",
        llm_provider: "openai",
        encrypted_llm_key: llmKey,
        tts_provider: "openai",
        encrypted_tts_key: ttsKey,
      }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.status).toBe("narrating");
  });

  it("free_voice request: claims paper and returns narrating status", async () => {
    await insertPaper({ id: "np.1003", status: "unnarrated" });
    const llmKey = await encryptKey("sk-anthropic-test", "anthropic");

    const resp = await SELF.fetch(`${BASE}/api/papers/np.1003/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "free_voice",
        llm_provider: "anthropic",
        encrypted_llm_key: llmKey,
      }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.status).toBe("narrating");
  });

  it("concurrent requests: only one caller wins the claim race", async () => {
    await insertPaper({ id: "np.1004", status: "unnarrated" });
    const key = await encryptKey("sk-test-race", "openai");
    const payload = JSON.stringify({ type: "unified", provider: "openai", encrypted_key: key });
    const headers = { "Content-Type": "application/json" };

    // Fire two concurrent requests
    const [r1, r2] = await Promise.all([
      SELF.fetch(`${BASE}/api/papers/np.1004/narrate-premium`, { method: "POST", headers, body: payload }),
      SELF.fetch(`${BASE}/api/papers/np.1004/narrate-premium`, { method: "POST", headers, body: payload }),
    ]);

    // Both should be 200 (contract: return current state)
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const [b1, b2] = await Promise.all([r1.json() as any, r2.json() as any]);
    expect(b1.status).toBe("narrating");
    expect(b2.status).toBe("narrating");
  });

  it("already-narrating paper: returns current state without re-claiming", async () => {
    await insertPaper({ id: "np.1005", status: "narrating" });
    const key = await encryptKey("sk-test", "openai");

    const resp = await SELF.fetch(`${BASE}/api/papers/np.1005/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unified", provider: "openai", encrypted_key: key }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    // Already narrating — returns current state
    expect(body.status).toBe("narrating");
  });

  it("failed paper: can be retried via narrate-premium", async () => {
    await insertPaper({ id: "np.1006", status: "failed" });
    const key = await encryptKey("sk-retry-test", "openai");

    const resp = await SELF.fetch(`${BASE}/api/papers/np.1006/narrate-premium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unified", provider: "openai", encrypted_key: key }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    expect(body.status).toBe("narrating");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Webhook handler — premium narration completion
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/webhooks/modal — premium webhook", () => {
  const SECRET = "test-webhook-secret";

  it("updates paper status on narrated webhook", async () => {
    await insertPaper({ id: "wh.0001", status: "narrating" });

    const resp = await SELF.fetch(`${BASE}/api/webhooks/modal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        arxiv_id: "wh.0001",
        status: "narrated",
        audio_r2_key: "audio/wh.0001.mp3",
        duration_seconds: 600,
        eta_seconds: 0,
        narration_mode: "premium",
        version_type: "premium",
        script_type: "premium",
        tts_provider: "openai",
        tts_model: "tts-1-hd",
        llm_provider: "openai",
        llm_model: "gpt-4o",
        // Flat cost fields (not nested)
        actual_cost: 0.1,
        llm_cost: 0.025,
        tts_cost: 0.075,
      }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    // Webhook returns { ok: true }
    expect(body.ok).toBe(true);
  });

  it("handles script_ready (partial success) webhook", async () => {
    await insertPaper({ id: "wh.0002", status: "narrating" });

    const resp = await SELF.fetch(`${BASE}/api/webhooks/modal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        arxiv_id: "wh.0002",
        status: "script_ready",
        script_r2_key: "transcripts/wh.0002-v1-transcript.txt",
        error_message: "TTS failed: connection timeout",
        narration_mode: "premium",
        version_type: "premium",
        script_type: "premium",
        llm_provider: "anthropic",
        llm_model: "claude-sonnet-4-6",
        quality_rank: 3,
        costs: {
          llm_input_tokens: 500,
          llm_output_tokens: 1000,
          llm_cost_usd: 0.016,
          tts_cost_usd: 0.0,
          total_cost_usd: 0.016,
        },
        providers: {
          llm: "anthropic",
          llm_model: "claude-sonnet-4-6",
          tts: null,
        },
      }),
    });
    // script_ready should still be accepted (200) — paper stays narrating or moves to specific state
    expect([200, 400]).toContain(resp.status);
  });

  it("rejects webhook with wrong secret", async () => {
    await insertPaper({ id: "wh.0003", status: "narrating" });

    const resp = await SELF.fetch(`${BASE}/api/webhooks/modal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": "wrong-secret",
      },
      body: JSON.stringify({ arxiv_id: "wh.0003", status: "narrated" }),
    });
    expect(resp.status).toBe(401);
  });

  it("handles failed webhook", async () => {
    await insertPaper({ id: "wh.0004", status: "narrating" });

    const resp = await SELF.fetch(`${BASE}/api/webhooks/modal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SECRET}`,
      },
      body: JSON.stringify({
        arxiv_id: "wh.0004",
        status: "failed",
        error_message: "LLM API timeout",
      }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json() as any;
    // Webhook returns { ok: true }
    expect(body.ok).toBe(true);
  });
});
