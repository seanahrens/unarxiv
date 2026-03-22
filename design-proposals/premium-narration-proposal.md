# Premium Narration — Design Proposal

**Author:** Sean Ahrens / unarXiv
**Date:** March 2026
**Status:** Final

---

## 1. Overview

Premium Narration lets users supply their own API keys to unlock higher-quality narration for any arXiv paper on unarXiv. The feature pairs a premium LLM (Anthropic Claude, OpenAI GPT, or Google Gemini) for script improvement with a premium TTS provider (OpenAI TTS, ElevenLabs, Google Cloud TTS, Amazon Polly, or Azure Speech) for near-human voice synthesis. OpenAI and Google each serve as "unified-key" providers — a single API key covers both scripting and voice, minimizing setup friction. The result is stored alongside existing free narrations so that every user benefits — the play button always serves the best available version.

### Core Principles

- **Community benefit**: Premium narrations are public. One user's investment upgrades the paper for everyone.
- **Server-side encrypted keys in localStorage**: API keys are encrypted by the Worker (AES-256-GCM) before reaching the client. localStorage stores only ciphertext. Decryption happens server-side when keys are needed.
- **Non-destructive**: Free narrations are never overwritten. All versions coexist.
- **Graceful degradation**: If premium fails at any stage, the free version remains available.
- **Eager scripting**: Scripts are generated when papers enter the DB (decoupled from TTS), enabling instant cost estimates.

---

## 2. Architecture & Data Model

### 2.1 Eager Script Generation

**Architectural change:** Script generation is decoupled from TTS and runs eagerly when a paper enters the database, rather than waiting for a "Narrate" click.

When a paper is submitted via `POST /api/papers`, the Worker dispatches a lightweight script-only job to Modal. This runs parser_v2 to produce a free-tier script and uploads it to R2. The `papers` table gains a `script_status` column:

```sql
ALTER TABLE papers ADD COLUMN script_status TEXT DEFAULT 'pending'
    CHECK(script_status IN ('pending', 'processing', 'completed', 'failed'));
ALTER TABLE papers ADD COLUMN script_char_count INTEGER;  -- populated on completion
```

Benefits:
- **Instant cost estimates**: When a user opens the premium modal, the character count is already known. No waiting.
- **Faster free narration**: When "Narrate" is clicked, only TTS needs to run (script is already done).
- **Better search/preview**: Scripts can power future features like paper summaries or chapter navigation.

The existing "Narrate" button triggers TTS-only for papers that already have a completed script. For papers where scripting failed or is still pending, it falls back to the current combined pipeline.

### 2.2 Narration Versions

Each paper can have multiple narration versions. A version is defined by the combination of its script tier and audio tier.

**Quality tiers (ordered lowest → highest):**

| Tier | Script | Audio | Description |
|------|--------|-------|-------------|
| `free` | parser_v2 (rule-based) | edge-tts (Microsoft Neural) | Current default |
| `premium` | LLM-rewritten (Claude/GPT/Gemini) | OpenAI TTS / ElevenLabs / Google Cloud TTS / Polly / Azure | User-funded upgrade |

Future tiers (e.g., `premium-plus` with custom voice cloning) can slot in without schema changes.

### 2.3 D1 Schema Changes

A new `narration_versions` table stores metadata for each version. The existing `papers` table gets a pointer to the "best" version for fast lookups.

```sql
CREATE TABLE IF NOT EXISTS narration_versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,

    -- Quality identifiers
    script_tier     TEXT NOT NULL DEFAULT 'free',    -- 'free', 'premium'
    audio_tier      TEXT NOT NULL DEFAULT 'free',    -- 'free', 'premium'
    quality_rank    INTEGER NOT NULL DEFAULT 0,      -- higher = better

    -- Audio metadata
    audio_r2_key    TEXT,
    audio_size_bytes INTEGER,
    duration_seconds INTEGER,

    -- Script metadata
    script_r2_key   TEXT,

    -- Provider info (freeform TEXT — no CHECK constraints, validated in app layer)
    tts_provider    TEXT NOT NULL DEFAULT 'edge-tts',
    tts_model       TEXT,                              -- e.g. 'eleven_multilingual_v2', 'Neural2', 'neural'
    tts_voice       TEXT,                              -- voice ID/name used
    llm_provider    TEXT,                              -- 'anthropic', 'openai', 'google', null for free
    llm_model       TEXT,                              -- 'claude-sonnet-4-5', 'gpt-4o', 'gemini-2.0-flash'

    -- Cost tracking (actual costs incurred)
    llm_cost_usd    REAL,                              -- actual LLM spend for this version
    tts_cost_usd    REAL,                              -- actual TTS spend for this version
    total_cost_usd  REAL,                              -- llm + tts

    -- Job state
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    error_message   TEXT,
    eta_seconds     INTEGER,

    -- Who funded it (anonymized)
    funded_by_ip    TEXT,
    funded_by_token TEXT,

    -- Timestamps
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_nv_paper ON narration_versions(paper_id);
CREATE INDEX IF NOT EXISTS idx_nv_paper_rank ON narration_versions(paper_id, quality_rank DESC);
CREATE INDEX IF NOT EXISTS idx_nv_status ON narration_versions(status);
```

**Note on provider columns:** Provider names are stored as freeform TEXT (no CHECK constraints) and validated in the application layer. This avoids SQLite table recreation when adding providers — a critical consideration since D1 CHECK constraints can't be altered without recreating the table.

**Changes to the existing `papers` table:**

```sql
ALTER TABLE papers ADD COLUMN best_version_id INTEGER REFERENCES narration_versions(id);
ALTER TABLE papers ADD COLUMN script_status TEXT DEFAULT 'pending';
ALTER TABLE papers ADD COLUMN script_char_count INTEGER;
```

The `best_version_id` is updated whenever a narration version completes. It always points to the highest `quality_rank` version with `status = 'completed'`. The existing `audio_r2_key`, `duration_seconds`, etc. columns on `papers` continue to work — they represent the free version and serve as a fallback if `best_version_id` is NULL.

**Quality rank assignment:**

| script_tier | audio_tier | quality_rank |
|-------------|------------|-------------|
| free | free | 0 |
| premium | free | 1 |
| free | premium | 2 |
| premium | premium | 3 |

The rank is set at creation time based on the tier combination. "Best version" selection is a simple `ORDER BY quality_rank DESC LIMIT 1`.

### 2.4 R2 Storage Layout

Current R2 layout (unchanged for free tier):
```
audio/{arxiv_id}.mp3
transcripts/{arxiv_id}.txt
```

Premium versions use a versioned path:
```
audio/{arxiv_id}/v{version_id}.mp3
transcripts/{arxiv_id}/v{version_id}.txt
```

The original free-tier files stay at their current paths for backward compatibility. When a free narration is first created in the new system, a row in `narration_versions` is also created pointing to the legacy path.

### 2.5 Migration Strategy

For existing narrated papers, a one-time migration:

```sql
-- 1. Backfill narration_versions for existing narrated papers
INSERT INTO narration_versions (paper_id, script_tier, audio_tier, quality_rank,
    audio_r2_key, audio_size_bytes, duration_seconds, script_r2_key,
    tts_provider, status, completed_at)
SELECT id, 'free', 'free', 0,
    audio_r2_key, audio_size_bytes, duration_seconds,
    'transcripts/' || id || '.txt',
    'edge-tts', 'completed', completed_at
FROM papers WHERE status = 'narrated';

-- 2. Mark existing narrated papers as having completed scripts
UPDATE papers SET script_status = 'completed' WHERE status = 'narrated';

-- 3. Estimate script_char_count from existing transcripts (batch job via Modal)
```

Step 3 runs as a background job that reads each transcript from R2 and updates the `script_char_count` column.

---

## 3. Security Analysis

### 3.1 Server-Side Encrypted localStorage

**Approach:** API keys are encrypted server-side using AES-256-GCM before being sent to the client for localStorage storage. Decryption happens server-side when keys are needed for narration.

**How it works:**

1. User enters their API key in the premium narration modal.
2. Frontend sends the plaintext key to `POST /api/keys/encrypt` (HTTPS-only).
3. The Worker encrypts the key using AES-256-GCM with `ENCRYPTION_KEY` (a Cloudflare Worker secret) and returns the ciphertext.
4. Frontend stores the ciphertext in localStorage.
5. When the user starts a premium narration, the frontend sends the ciphertext to the Worker.
6. The Worker decrypts the key, validates it against the provider, and passes the plaintext to Modal for the narration job.
7. Neither the plaintext key nor the ciphertext is ever stored in D1 or R2.

**Encryption details:**

```typescript
// Worker-side encryption utility
async function encryptApiKey(plaintext: string, encryptionKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBuffer(encryptionKey), // 256-bit key from Worker secret
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  // Return IV + ciphertext as base64 — compact output (~100-120 chars per key)
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(ciphertext)));
}
```

**Security properties:**

| Property | Status |
|----------|--------|
| localStorage compromise alone | Attacker gets only ciphertext — useless without `ENCRYPTION_KEY` |
| Server compromise alone | Attacker gets `ENCRYPTION_KEY` but no ciphertext (not stored server-side) |
| Both compromised | Both required to recover keys — strong two-factor security model |
| Key rotation | New `ENCRYPTION_KEY` → old ciphertext invalid; users re-enter keys (acceptable UX) |

**Why a global `ENCRYPTION_KEY` (not per-user):**

Per-user encryption keys were considered but rejected. localStorage is already per-browser and per-origin — users on the same machine with separate browser profiles can't see each other's data, and users on different machines never share localStorage. A global secret is simpler and provides the same effective security for this threat model. The primary threat isn't user-vs-user isolation (already handled by the browser sandbox) — it's protecting keys if localStorage is dumped (e.g., XSS, malicious extension, device theft).

### 3.2 Threat Model Deep Dive

**XSS risk (LOW for unarXiv):**

unarXiv has a small XSS attack surface because React auto-escapes all rendered output, there is no user-generated HTML content, and inputs are mostly arXiv metadata (titles, authors, abstracts) which are pre-sanitized. Content Security Policy headers are already in place on Cloudflare Pages (`script-src 'self'` blocks inline scripts). Server-side encryption means even a successful XSS attack only obtains ciphertext from localStorage — not usable without the `ENCRYPTION_KEY`.

**Browser extension risk (MITIGATED):**

Extensions with `storage` permissions can read localStorage, but with server-side encryption they only get ciphertext. An extension would need to intercept the decrypted key in memory during the brief window when the Worker returns it — but the decrypted key never returns to the client. Decryption happens server-side only.

**Remaining attack surface:**

An attacker with full JavaScript execution context (e.g., compromised dependency, sophisticated XSS) could theoretically intercept the plaintext key during the initial encryption request (Step 2 above — the moment the user enters the key and it's sent to the server). This is a narrow window requiring active code execution at exactly the right moment, which is significantly harder than passively reading storage. There is no practical mitigation for this scenario short of hardware security keys, which is disproportionate for this use case.

**Shared/public computers:**

Show a warning during key entry: "Keys are stored in this browser." Offer a "Don't remember" checkbox that skips localStorage entirely — the key is encrypted, used for the single narration request, and discarded.

### 3.3 Key Transmission Security

**Strict requirements:**

1. **HTTPS only** — The API (`api.unarxiv.org`) is already HTTPS-only via Cloudflare. Keys are sent in the request body (POST), never in URL parameters or headers that might be logged.

2. **Never logged** — The Cloudflare Worker must not `console.log` any request body containing API keys. A sanitization utility strips key fields before any logging.

3. **Never persisted server-side** — Keys exist only in Worker memory for the duration of the encrypt/decrypt/dispatch cycle. They never touch D1 or R2.

4. **Worker → Modal pass-through** — The Worker decrypts the key and forwards the plaintext to Modal in the dispatch request body. Modal uses it for the LLM and TTS API calls, then discards it. Keys are not stored in Modal Secrets.

5. **CORS scoping** — The premium narration endpoint only accepts requests from `https://unarxiv.org` (already enforced by existing CORS config).

### 3.4 Cross-Device Sync

Encrypted key blobs are included in the existing sync URL payload alongside `user_token` and `list_tokens`. This means users who sync across devices also transfer their (encrypted) API keys — which can be decrypted by the Worker on any device since the `ENCRYPTION_KEY` is global.

**Unified-key providers simplify sync.** A user who chose OpenAI Voice + Smart Script stores only one encrypted key blob (for `openai`). When synced, that single blob covers both LLM and TTS on the new device. Contrast with a dual-key user who stores two blobs (e.g., `elevenlabs` + `anthropic`). In the common case, users have 1-2 encrypted blobs total — the sync payload stays small.

If a user changes their API keys, they need to re-sync (generate a new sync URL). The sync payload format:

```typescript
interface SyncPayload {
  user_token: string;
  list_tokens: string[];
  // New: encrypted API key blobs
  encrypted_keys?: {
    [provider: string]: {
      cipher: string;  // AES-256-GCM ciphertext (base64)
      hint: string;    // last 3-4 chars of original key
    };
  };
}
```

Note: The key is keyed by *provider name* (e.g., `"openai"`, `"elevenlabs"`, `"anthropic"`), not by role (LLM vs. TTS). For unified-key providers, one entry covers both roles.

### 3.5 Rate Limiting & Abuse Prevention

Even though premium narration uses the user's own API keys (so cost abuse is self-limiting), we still need protection:

- **Per-IP rate limit**: Max 5 premium narration requests per IP per day (separate from the free narration limit). Prevents a single user from monopolizing Modal compute.
- **Per-paper limit**: Max 1 concurrent premium narration per paper. If a premium narration is already in progress, subsequent requests get "Premium narration already in progress."
- **Key validation before dispatch**: The Worker decrypts and validates the API key with a lightweight test call (e.g., ElevenLabs `/v1/user` endpoint, Anthropic `/v1/messages` with a minimal prompt) before dispatching to Modal. This prevents wasting Modal compute on invalid keys.
- **Abuse flag**: If a key repeatedly fails validation, temporarily block that IP from premium requests (1-hour cooldown after 3 failures).

---

## 4. API & Backend Design

### 4.1 New API Endpoints

#### `POST /api/keys/encrypt`

Encrypts an API key for localStorage storage. Request body:

```typescript
{ provider: string; api_key: string }
```

Response:
```json
{ "encrypted": "base64-encoded-ciphertext" }
```

The Worker encrypts the key using AES-256-GCM with `ENCRYPTION_KEY` and returns the ciphertext. The plaintext key is not logged or stored.

#### `POST /api/keys/validate`

Decrypts and validates an API key against the provider. Request body:

```typescript
{ provider: string; encrypted_key: string; role?: 'llm' | 'tts' | 'both' }
```

The `role` parameter controls what validation is performed. For unified-key providers (OpenAI, Google), `role: 'both'` validates the key against both the LLM endpoint and the TTS endpoint. Defaults to `'both'` for unified-key providers and the obvious single role for others.

Response:
```json
{ "valid": true, "provider_info": { "name": "OpenAI", "capabilities": ["llm", "tts"] } }
```

or on failure:
```json
{ "valid": false, "error": "Invalid API key" }
```

#### `POST /api/papers/:id/narrate-premium`

Initiates a premium narration job. The request body maps directly to the option the user selected in Step 1 — the frontend sends the configuration, and the Worker figures out the rest.

**Three configuration shapes** correspond to the three types of options:

```typescript
// Shape 1: Unified-key provider (OpenAI Voice, Google Voice)
// One key serves both LLM scripting and TTS voice.
interface UnifiedKeyRequest {
  type: 'unified';
  provider: 'openai' | 'google';           // covers both LLM and TTS
  encrypted_key: string;                    // single encrypted ciphertext
}

// Shape 2: Dual-key provider (ElevenLabs, Amazon Polly, Azure Speech)
// TTS key for voice + separate LLM key for scripting.
interface DualKeyRequest {
  type: 'dual';
  tts_provider: 'elevenlabs' | 'amazon-polly' | 'azure-speech';
  tts_encrypted_key: string;
  llm_provider: 'anthropic' | 'openai' | 'google';
  llm_encrypted_key: string;
}

// Shape 3: Free voice + LLM scripting (unarXiv Voice + Smart Script)
// LLM key only — TTS uses free edge-tts.
interface FreeVoiceRequest {
  type: 'free-voice';
  llm_provider: 'anthropic' | 'openai' | 'google';
  llm_encrypted_key: string;
}

type PremiumNarrationRequest = UnifiedKeyRequest | DualKeyRequest | FreeVoiceRequest;
```

**Worker processing by type:**

| Type | LLM Provider | LLM Key | TTS Provider | TTS Key | script_tier | audio_tier | quality_rank |
|------|-------------|---------|-------------|---------|-------------|------------|-------------|
| `unified` | Same as `provider` | `encrypted_key` | Same as `provider` | `encrypted_key` (reused) | premium | premium | 3 |
| `dual` | `llm_provider` | `llm_encrypted_key` | `tts_provider` | `tts_encrypted_key` | premium | premium | 3 |
| `free-voice` | `llm_provider` | `llm_encrypted_key` | `edge-tts` | *(none)* | premium | free | 1 |

For `unified` requests, the Worker decrypts the single key and passes it to Modal as both `llm_api_key` and `tts_api_key`. OpenAI's key works for both their Chat Completions API (LLM) and their TTS API; Google's key works for both Gemini (LLM) and Cloud TTS.

Response (200):
```json
{
  "version_id": 42,
  "status": "processing",
  "estimated_cost": { "llm_usd": 0.03, "tts_usd": 0.18, "total_usd": 0.21 },
  "paper": { "..." : "..." }
}
```

Error responses:
- `400` — Missing required fields, invalid provider, unknown type
- `401` — API key validation failed (with provider-specific error message)
- `409` — Premium narration already in progress for this paper
- `429` — Rate limit exceeded

The Worker decrypts keys, validates them, creates a `narration_versions` row, and dispatches to Modal. Keys are never stored in D1.

#### `GET /api/papers/:id/narrate-premium/estimate`

Returns paper-specific cost estimates for all provider combinations. The frontend calls this once when the modal opens and populates every provider card with "~$X.XX for this paper."

No query params needed — returns estimates for all providers at once:

```json
{
  "script_chars": 45000,
  "script_ready": true,
  "combos": {
    "anthropic": {
      "free":         { "total": 0.04, "llm": 0.04, "tts": 0 },
      "elevenlabs":   { "total": 0.56, "llm": 0.04, "tts": 0.52 },
      "openai-tts":   { "total": 0.06, "llm": 0.04, "tts": 0.02 },
      "google-tts":   { "total": 0.06, "llm": 0.04, "tts": 0.02 },
      "amazon-polly": { "total": 0.06, "llm": 0.04, "tts": 0.02 },
      "azure-speech": { "total": 0.06, "llm": 0.04, "tts": 0.02 }
    },
    "openai": {
      "free":         { "total": 0.03, "llm": 0.03, "tts": 0 },
      "openai-tts":   { "total": 0.05, "llm": 0.03, "tts": 0.02 },
      "elevenlabs":   { "total": 0.55, "llm": 0.03, "tts": 0.52 },
      "google-tts":   { "total": 0.05, "llm": 0.03, "tts": 0.02 },
      "amazon-polly": { "total": 0.05, "llm": 0.03, "tts": 0.02 },
      "azure-speech": { "total": 0.05, "llm": 0.03, "tts": 0.02 }
    },
    "google": {
      "free":         { "total": 0.001, "llm": 0.001, "tts": 0 },
      "google-tts":   { "total": 0.02, "llm": 0.001, "tts": 0.02 },
      "elevenlabs":   { "total": 0.52, "llm": 0.001, "tts": 0.52 },
      "openai-tts":   { "total": 0.02, "llm": 0.001, "tts": 0.02 },
      "amazon-polly": { "total": 0.02, "llm": 0.001, "tts": 0.02 },
      "azure-speech": { "total": 0.02, "llm": 0.001, "tts": 0.02 }
    }
  },
  "options": [
    { "name": "unarXiv Voice + Smart Script", "type": "free-voice", "cost": 0.04 },
    { "name": "OpenAI Voice + Smart Script", "type": "unified", "provider": "openai", "cost": 0.05, "keys": 1 },
    { "name": "Google Voice + Smart Script", "type": "unified", "provider": "google", "cost": 0.02, "keys": 1 },
    { "name": "ElevenLabs + Smart Script", "type": "dual", "tts_provider": "elevenlabs", "cost_range": [0.52, 0.56], "keys": 2 },
    { "name": "Amazon Polly + Smart Script", "type": "dual", "tts_provider": "amazon-polly", "cost_range": [0.02, 0.06], "keys": 2 },
    { "name": "Azure Voice + Smart Script", "type": "dual", "tts_provider": "azure-speech", "cost_range": [0.02, 0.06], "keys": 2 }
  ]
}
```

The `options` array is a convenience for the frontend — it pre-computes the display data for Step 1 cards. For unified-key options, `cost` is the exact combined total (LLM and TTS from same provider). For dual-key options, `cost_range` reflects the range across possible LLM providers (cheapest with Google Gemini, most expensive with Anthropic Claude). The unarXiv Voice option shows the mid-tier LLM cost as its default estimate.

The UI shows the `total` on provider cards as "~$X.XX for this paper." The `llm`/`tts` breakdown is behind an ℹ️ button for curious users. Estimates are approximate because the LLM rewrite may change the script length (especially with added visual content descriptions).

If `script_ready` is false (scripting still pending — rare since it runs eagerly), the estimate falls back to abstract length × a multiplication factor and is flagged in the UI as less accurate.

#### `GET /api/papers/:id/versions`

Lists all narration versions for a paper:
```json
{
  "versions": [
    {
      "id": 1,
      "script_tier": "free",
      "audio_tier": "free",
      "quality_rank": 0,
      "tts_provider": "edge-tts",
      "duration_seconds": 1245,
      "status": "completed",
      "created_at": "2026-01-15T..."
    },
    {
      "id": 42,
      "script_tier": "premium",
      "audio_tier": "premium",
      "quality_rank": 3,
      "tts_provider": "elevenlabs",
      "llm_provider": "anthropic",
      "duration_seconds": 1180,
      "status": "completed",
      "total_cost_usd": 0.19,
      "created_at": "2026-03-20T..."
    }
  ],
  "best_version_id": 42
}
```

#### `GET /api/papers/:id/audio?version={version_id}`

Extended to support version-specific audio. Without the `version` param, serves the best available version (current behavior preserved).

### 4.2 Worker → Modal Flow for Premium

The existing `dispatchToModal` function is extended (not replaced) to handle premium requests. The Worker resolves the request type into a normalized config before dispatch:

```typescript
// Resolve the PremiumNarrationRequest into a normalized dispatch config
function resolveConfig(req: PremiumNarrationRequest, decryptedKeys: Record<string, string>): DispatchConfig {
  switch (req.type) {
    case 'unified':
      // Single key serves double duty — LLM and TTS from the same provider
      return {
        llm_provider: req.provider,
        llm_api_key: decryptedKeys[req.provider],
        llm_model: DEFAULT_LLM_MODELS[req.provider],
        tts_provider: req.provider === 'openai' ? 'openai-tts' : 'google-tts',
        tts_api_key: decryptedKeys[req.provider],  // same key
      };
    case 'dual':
      return {
        llm_provider: req.llm_provider,
        llm_api_key: decryptedKeys['llm'],
        llm_model: DEFAULT_LLM_MODELS[req.llm_provider],
        tts_provider: req.tts_provider,
        tts_api_key: decryptedKeys['tts'],
      };
    case 'free-voice':
      return {
        llm_provider: req.llm_provider,
        llm_api_key: decryptedKeys['llm'],
        llm_model: DEFAULT_LLM_MODELS[req.llm_provider],
        tts_provider: 'edge-tts',
        tts_api_key: undefined,  // no key needed
      };
  }
}

async function dispatchPremiumToModal(
  env: Env,
  paper: Paper,
  versionId: number,
  config: DispatchConfig,
  baseUrl: string
): Promise<void> {
  const resp = await fetch(env.MODAL_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MODAL_WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({
      arxiv_id: paper.id,
      tex_source_url: arxivSrcUrl(paper.id),
      callback_url: `${baseUrl}/api/webhooks/modal`,
      paper_title: paper.title,
      paper_author: (JSON.parse(paper.authors) as string[]).join(", "),
      paper_date: paper.published_date || "",
      mode: "premium",
      version_id: versionId,
      llm_provider: config.llm_provider,
      llm_api_key: config.llm_api_key,
      llm_model: config.llm_model,
      tts_provider: config.tts_provider,
      tts_api_key: config.tts_api_key,
      _secret: env.MODAL_WEBHOOK_SECRET,
    }),
  });
  // ... error handling same as existing dispatchToModal
}
```

**Critical: the Worker never stores `llm_api_key` or `tts_api_key` anywhere.** They exist only in memory for the duration of the decrypt → validate → dispatch cycle. For unified-key providers, the same plaintext key is passed as both `llm_api_key` and `tts_api_key` — Modal doesn't need to know they came from a single ciphertext.

### 4.3 Modal Worker Changes

A new function `narrate_paper_premium` handles the premium pipeline. Modal receives a normalized config from the Worker — it doesn't need to know whether the request originated from a unified-key or dual-key option. It just gets an `llm_provider`/`llm_api_key` and a `tts_provider`/`tts_api_key`.

```python
@app.function(image=premium_image, secrets=[...], timeout=3600)
def narrate_paper_premium(
    arxiv_id: str,
    tex_source_url: str,
    callback_url: str,
    version_id: int,
    llm_provider: str,
    llm_api_key: str,
    llm_model: str,
    tts_provider: str,         # 'edge-tts', 'openai-tts', 'elevenlabs', 'google-tts', etc.
    tts_api_key: str | None,   # None for edge-tts (free voice)
    paper_title: str = "",
    paper_author: str = "",
    paper_date: str = "",
):
    """Premium narration: LLM script improvement + premium TTS.

    For unified-key providers (OpenAI, Google), llm_api_key and tts_api_key
    are the same plaintext key — Modal doesn't care.
    For free voice, tts_provider is 'edge-tts' and tts_api_key is None.
    """

    # Stage 1: Gather inputs
    #   - Download the free transcript from R2 (eager scripting should have it ready)
    #   - Fallback: run parser_v2 if no free script exists yet
    #   - Download the paper's TeX source from arXiv (preferred) or PDF if no TeX
    #   - TeX gives the LLM semantic structure for figure/table descriptions

    # Stage 2: LLM script improvement
    #   - Instantiate the LLM provider: LLM_PROVIDERS[llm_provider](llm_api_key, llm_model)
    #   - Pass both the TeX/PDF source AND the baseline script to the LLM
    #   - LLM describes visual content (figures, graphs, tables) that the free tier strips
    #   - Save the improved script to R2 at transcripts/{arxiv_id}/v{version_id}.txt
    #   - Report actual LLM cost in the callback

    # Stage 3: TTS synthesis
    #   - If tts_provider == 'edge-tts': use existing free pipeline (no key needed)
    #   - Otherwise: instantiate TTS_PROVIDERS[tts_provider](tts_api_key)
    #   - Chunk the script to respect provider-specific limits
    #   - Concatenate audio chunks with ffmpeg
    #   - Upload to R2 at audio/{arxiv_id}/v{version_id}.mp3
    #   - Report actual TTS cost in the callback (0 for edge-tts)

    # Stage 4: Callback with results (including actual costs)
```

**Provider instantiation is uniform.** Modal routes to the correct provider class via the registry dicts (`LLM_PROVIDERS` and `TTS_PROVIDERS`). For unified-key cases, `llm_api_key == tts_api_key` — the same key is passed to both provider classes independently. For `edge-tts` (free voice), the existing free TTS pipeline is used directly, no provider class needed.

The `premium_image` extends the base image:

```python
premium_image = image.pip_install(
    "anthropic>=0.40.0",
    "openai>=1.50.0",          # covers both LLM (Chat) and TTS APIs
    "google-genai>=1.0.0",     # covers both Gemini LLM and Cloud TTS
    "elevenlabs>=1.0.0",
    "google-cloud-texttospeech>=2.16.0",
    "boto3>=1.34.0",           # Amazon Polly
    "azure-cognitiveservices-speech>=1.37.0",
)
```

### 4.4 LLM Script Improvement

#### Source preference: TeX over PDF

For premium LLM scripting, the pipeline **prefers TeX source when available** (which is most arXiv papers). TeX provides semantic structure — `\section{}`, `\begin{equation}`, `\caption{}`, `\begin{tabular}` — that gives the LLM dramatically better context for:

- **Figure/table descriptions**: The LLM can read `\caption{}` tags, axis labels, column headers, and surrounding discussion to produce accurate descriptions. With PDF-only input, figure content is lost entirely (it's rasterized) and table structure is ambiguous.
- **Equation rendering**: LaTeX markup (`\frac{a}{b}`, `\int_0^\infty`) unambiguously specifies mathematical content, making spoken-form expansion reliable. PDF text extraction often garbles math.
- **Document structure**: `\section`, `\subsection`, `\begin{proof}` markers let the LLM add appropriate transitions and emphasis.

This mirrors the existing parser_v2 preference hierarchy. The pipeline falls back to PDF text extraction (via PyMuPDF) only when no TeX source is available on arXiv.

#### Visual content description — a core premium value proposition

The free-tier parser (parser_v2) strips figures, images, graphs, and most tables from the narration script. Listeners miss potentially critical visual content. **Premium LLM scripting describes visual content in moderate detail**, giving listeners the full paper experience.

The LLM is instructed to:

- Describe the key takeaway of each figure, graph, chart, or diagram.
- Summarize table data narratively (trends, outliers, comparisons) rather than reading every cell.
- Reference the figure/table number so the listener can locate it in the PDF.
- Keep descriptions concise but substantive — 2-4 sentences per visual element.

Example — instead of stripping "Figure 3", the premium script outputs:

> "Figure 3 shows a bar chart comparing model accuracy across four benchmarks — GLUE, SuperGLUE, SQuAD, and MMLU. The proposed method outperforms all baselines by 3 to 5 percentage points on each benchmark, with the largest gain on MMLU."

This is one of the strongest arguments for premium narration: listeners get content that is literally impossible to convey in the free version.

#### LLM system prompt

The LLM receives the paper's source (TeX or PDF-extracted text) along with the free-tier script as a reference, and this system prompt:

```
You are creating a premium narration script for an academic paper audiobook. The
script will be read aloud by a high-quality text-to-speech system.

You are given:
1. The paper's source (LaTeX or extracted PDF text)
2. A baseline narration script (generated by a rule-based parser)

Your job is to produce a significantly improved script suitable for audio.

Rules:
- Preserve all factual content. Do not add or remove information.
- Improve flow and readability for audio consumption.
- DESCRIBE ALL VISUAL CONTENT: For every figure, graph, chart, diagram, and table,
  write a 2-4 sentence description covering the key takeaway, trends, and comparisons.
  Reference the figure/table number. If the source includes captions or axis labels,
  use them. Do not skip any visual element.
- Expand abbreviated mathematical notation into spoken form
  (e.g., "x^2" → "x squared", "∑" → "the sum of", "\frac{a}{b}" → "a over b").
- Add natural transitions between sections.
- Replace citation markers (e.g., "[1]", "[Smith et al.]") with natural references
  (e.g., "as shown by Smith and colleagues").
- Standardize pronunciation hints for technical terms.
- Keep the script length within 20% of the baseline (visual descriptions will add
  length, but don't pad unnecessarily elsewhere).
- Output ONLY the improved script. No commentary or meta-text.
```

Note: The length constraint is relaxed to 20% (vs. 10% in the original proposal) to accommodate the added visual content descriptions.

#### Generic LLM provider interface

```python
from abc import ABC, abstractmethod

class LLMProvider(ABC):
    @abstractmethod
    def improve_script(self, source: str, baseline_script: str) -> tuple[str, float]:
        """
        Args:
            source: Paper source — TeX markup or PDF-extracted text.
            baseline_script: Free-tier script from parser_v2 (used as reference).
        Returns:
            (improved_script, cost_usd)
        """
        ...

class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def improve_script(self, source: str, baseline_script: str) -> tuple[str, float]:
        user_content = (
            f"<paper_source>\n{source}\n</paper_source>\n\n"
            f"<baseline_script>\n{baseline_script}\n</baseline_script>"
        )
        response = self.client.messages.create(
            model=self.model,
            max_tokens=len(baseline_script) // 2,
            system=SCRIPT_IMPROVEMENT_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
        cost = self._calculate_cost(response.usage)
        return response.content[0].text, cost

class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def improve_script(self, source: str, baseline_script: str) -> tuple[str, float]:
        user_content = (
            f"<paper_source>\n{source}\n</paper_source>\n\n"
            f"<baseline_script>\n{baseline_script}\n</baseline_script>"
        )
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SCRIPT_IMPROVEMENT_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
        cost = self._calculate_cost(response.usage)
        return response.choices[0].message.content, cost

class GoogleProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def improve_script(self, source: str, baseline_script: str) -> tuple[str, float]:
        user_content = (
            f"<paper_source>\n{source}\n</paper_source>\n\n"
            f"<baseline_script>\n{baseline_script}\n</baseline_script>"
        )
        response = self.client.models.generate_content(
            model=self.model,
            config={"system_instruction": SCRIPT_IMPROVEMENT_PROMPT},
            contents=user_content,
        )
        cost = self._calculate_cost(response.usage_metadata)
        return response.text, cost

LLM_PROVIDERS = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "google": GoogleProvider,
}
```

Adding a new LLM provider is a single class implementing `improve_script()` and a one-line registration in `LLM_PROVIDERS`.

The LLM receives both the paper's original source (TeX or PDF text) and the baseline free-tier script. The source enables accurate figure/table descriptions (especially from TeX `\caption{}` tags), while the baseline script provides the structural skeleton to improve upon.

For very long papers (>100k chars of combined source + script), the input is chunked into sections and processed sequentially to stay within context limits.

### 4.5 Cost Estimation Logic

Cost estimation runs on the Worker (no Modal needed). It uses the paper's `script_char_count` (from eager scripting) and returns **combined totals** (LLM + TTS) for every possible provider pairing, so the modal can show "~$X.XX for this paper" on each provider card instantly:

```typescript
function estimateAllProviders(scriptCharCount: number): AllProviderEstimates {
  const inputTokens = Math.ceil(scriptCharCount / 4);
  // LLM output ≈ 1.1× input (slightly longer due to visual content descriptions)
  const outputTokens = Math.ceil(inputTokens * 1.1);

  const llmPricing: Record<string, { input: number; output: number }> = {
    anthropic: { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },  // Claude Sonnet 4.5
    openai:    { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },  // GPT-4o
    google:    { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 }, // Gemini 2.0 Flash
  };

  const ttsPricing: Record<string, number> = {  // per character
    free:           0,               // existing edge-tts — no cost
    elevenlabs:     0.30 / 1_000,   // $0.30/1K chars (Scale tier)
    "openai-tts":   0.015 / 1_000,  // $15/1M chars (tts-1-hd)
    "google-tts":   0.016 / 1_000,  // $16/1M chars (Studio voices)
    "amazon-polly": 0.016 / 1_000,  // $16/1M chars (Neural)
    "azure-speech": 0.016 / 1_000,  // $16/1M chars (Neural)
  };

  // Compute per-provider costs
  const llmCosts: Record<string, number> = {};
  for (const [provider, rates] of Object.entries(llmPricing)) {
    llmCosts[provider] = inputTokens * rates.input + outputTokens * rates.output;
  }

  const ttsCosts: Record<string, number> = {};
  for (const [provider, rate] of Object.entries(ttsPricing)) {
    // TTS chars = LLM output chars (the improved script is what gets synthesized)
    ttsCosts[provider] = outputTokens * 4 * rate;
  }

  // Compute combined totals for every LLM × TTS pairing
  const combos: Record<string, Record<string, { total: number; llm: number; tts: number }>> = {};
  for (const llm of Object.keys(llmCosts)) {
    combos[llm] = {};
    for (const tts of Object.keys(ttsCosts)) {
      combos[llm][tts] = {
        total: round2(llmCosts[llm] + ttsCosts[tts]),
        llm: round3(llmCosts[llm]),
        tts: round3(ttsCosts[tts]),
      };
    }
  }

  return { combos, llm_costs: llmCosts, tts_costs: ttsCosts };
}
```

**How the UI uses this data:**

- **Option cards (Step 1):** Each card shows a single combined cost. For unified-key options (OpenAI, Google), the cost is exact (LLM + TTS from the same provider). For dual-key options, the `options[].cost_range` shows the range across LLM providers. The unarXiv Voice card shows the LLM-only cost (TTS is free).
- **Step 2 (dual-key only):** When the user selects an LLM provider in the dual-key flow, the cost updates from the range to the exact combined total.
- **Confirmation screen (Step 3):** Shows the combined total: "Total: ~$X.XX for this paper." An ℹ️ "Cost breakdown" button expands to show "Script AI: ~$X.XX / Voice: ~$X.XX" (or "Script AI: ~$X.XX / Voice: free"). For unified-key options: "Script AI + Voice ([provider]): ~$X.XX."
- The `~` prefix signals that the LLM rewrite may change the script length (especially with added visual content descriptions), so the actual cost could differ slightly.

---

## 5. UI/UX Design

### 5.1 Entry Points

**Paper card dropdown menu (`PaperActionsMenu.tsx`):**

A new menu item appears for all papers (narrated or not):

```
──────────────────
✦ Get Near-Human Narration
──────────────────
```

The sparkle icon (✦) is small and subtle, distinguishing the option from the free "Narrate" action. This item opens the Premium Narration Modal.

**Paper detail page (`PaperPageContent.tsx`):**

Same menu item in the `PaperActionButton` dropdown.

### 5.2 Premium Narration Modal

The modal uses a **cost-first** flow: the user browses options and sees paper-specific pricing before entering any API keys. Keys are requested only after the user has decided what they want.

**Key structural insight — unified-key providers:** OpenAI and Google each offer both LLM and TTS capabilities. When a user picks an OpenAI or Google option, a single API key covers both scripting and voice — dramatically simplifying the experience. For TTS-only providers (ElevenLabs, Amazon Polly, Azure), a separate LLM key is always needed.

#### Step 1: Choose Your Option (no keys needed)

The user sees a list of options with paper-specific costs. No keys, no sign-up — just browse and pick.

```
┌─────────────────────────────────────────────┐
│  ✦ Get Near-Human Narration                 │
│                                             │
│  All options include AI-enhanced scripting  │
│  ℹ️                                         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★ unarXiv Voice + Smart Script   │    │
│  │ Same voice, smarter script.         │    │
│  │              ~$0.04 for this paper  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★★ OpenAI Voice + Smart Script   │    │
│  │ Natural, clear narrator.  1 key     │    │
│  │              ~$0.38 for this paper  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★★ Google Voice + Smart Script   │    │
│  │ Studio-quality narrator.  1 key     │    │
│  │              ~$0.42 for this paper  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★★★ ElevenLabs + Smart Script    │    │
│  │ Near-human narration.     2 keys    │    │
│  │              ~$0.54 for this paper  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★★ Amazon Polly + Smart Script   │    │
│  │ Neural narrator.          2 keys    │    │
│  │              ~$0.32 for this paper  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★★ Azure Voice + Smart Script    │    │
│  │ Neural narrator, HD voices. 2 keys  │    │
│  │              ~$0.35 for this paper  │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Select an option to continue →             │
└─────────────────────────────────────────────┘
```

**Design notes for Step 1:**

- **Cost-first.** The user sees options and paper-specific prices with zero friction. No sign-up, no key entry, no decisions about providers or tiers. Just "what do you want and what does it cost?"
- **"All options include AI-enhanced scripting" one-liner** at the top. An ℹ️ expands: "Premium scripting uses an LLM to rewrite the paper for audio: describes figures and graphs in detail, improves equation readability, smooths transitions between sections."
- **Each card is a complete option**, not a provider to configure. "OpenAI Voice + Smart Script" is a single thing — the user doesn't need to think about LLM vs. TTS providers.
- **"1 key" / "2 keys" badges** on each card tell the user upfront how many API keys they'll need. Unified-key options (OpenAI, Google) highlight their simplicity advantage.
- **unarXiv Voice + Smart Script** is the first option (cheapest). "Same voice, smarter script" makes the value clear. No key count badge — it requires an LLM key, which is shown in Step 2.
- **Costs are paper-specific combined totals.** Computed from the paper's `script_char_count` via the `/estimate` endpoint. The `~` prefix signals the LLM rewrite may change the final character count. For unified-key options, the LLM provider matches the TTS provider (OpenAI uses GPT for scripting, Google uses Gemini). For the "unarXiv Voice" option, the cost assumes a mid-tier LLM default (adjustable in Step 2). For dual-key options (ElevenLabs, Polly, Azure), the cost assumes a mid-tier LLM default.
- If `script_char_count` is not yet available (rare — scripting still pending), the modal shows "Estimating cost..." with a brief spinner.
- **No voice selection within providers for V1.** Each TTS provider uses a sensible default voice. Voice selection can be added later.
- Clicking a card advances to Step 2.

#### Step 2: Provide Keys

The key entry screen adapts based on the selected option. The smart part: unified-key providers need only one input.

**Unified-key option (e.g., "OpenAI Voice + Smart Script"):**

```
┌─────────────────────────────────────────────┐
│  ✦ OpenAI Voice + Smart Script              │
│                                             │
│  Your OpenAI key covers both AI scripting   │
│  and voice narration.                       │
│                                             │
│  OpenAI API Key:                            │
│  [                              ] [Test ✓]  │
│  ☐ Don't save this key   [Get API key →]   │
│                    ℹ️ Key storage             │
│                                             │
│              [← Back]    [Continue →]       │
└─────────────────────────────────────────────┘
```

**Dual-key option (e.g., "ElevenLabs + Smart Script"):**

```
┌─────────────────────────────────────────────┐
│  ✦ ElevenLabs + Smart Script                │
│                                             │
│  ─── Voice ──────────────────────────────── │
│  ElevenLabs API Key:                        │
│  [                              ] [Test ✓]  │
│  ☐ Don't save this key   [Get API key →]   │
│                                             │
│  ─── Script AI ──────────────────────────── │
│  Choose an LLM provider:                    │
│  (•) Anthropic Claude    ( ) OpenAI GPT     │
│  ( ) Google Gemini                          │
│                                             │
│  API Key: [                     ] [Test ✓]  │
│  ☐ Don't save this key   [Get API key →]   │
│                    ℹ️ Key storage             │
│                                             │
│              [← Back]    [Continue →]       │
└─────────────────────────────────────────────┘
```

**unarXiv Voice + Smart Script (free voice, LLM key only):**

```
┌─────────────────────────────────────────────┐
│  ✦ unarXiv Voice + Smart Script             │
│                                             │
│  Same voice you know, with a smarter        │
│  script. Choose an LLM provider:            │
│                                             │
│  (•) Anthropic Claude    ( ) OpenAI GPT     │
│  ( ) Google Gemini                          │
│                                             │
│  API Key: [                     ] [Test ✓]  │
│  ☐ Don't save this key   [Get API key →]   │
│                    ℹ️ Key storage             │
│                                             │
│              [← Back]    [Continue →]       │
└─────────────────────────────────────────────┘
```

**Design notes for Step 2:**

- **Minimal friction.** Unified-key options show a single input field with the note "Your [provider] key covers both AI scripting and voice narration." No LLM provider selector needed.
- **Dual-key options** show two inputs: TTS key first (the provider they explicitly chose), then an LLM provider selector with key input.
- **unarXiv Voice** option shows only the LLM selector + key input (no TTS key needed).
- The LLM provider selector (for dual-key and free-voice options) is a compact radio group, not full provider cards — the user already made their price/quality decision in Step 1.
- When a new key is entered, it's immediately sent to `POST /api/keys/encrypt` and the ciphertext is stored in localStorage. The plaintext never persists client-side.
- The "Test" button sends the encrypted key to `POST /api/keys/validate`, which decrypts and validates it. Shows a green ✓ or red ✗ inline.
- The "Don't save this key" checkbox skips localStorage — the key is encrypted, used for this single narration, and discarded.
- "← Back" returns to Step 1 (option selection).
- "Continue →" is disabled until all required keys are entered and validated.

**Get API Key links (shown inline per provider):**

| Provider | URL |
|----------|-----|
| Anthropic | `https://console.anthropic.com/settings/keys` |
| OpenAI | `https://platform.openai.com/api-keys` |
| Google AI | `https://aistudio.google.com/apikey` |
| ElevenLabs | `https://elevenlabs.io/app/settings/api-keys` |
| Amazon (Polly) | `https://console.aws.amazon.com/iam/home#/security_credentials` |
| Azure (Speech) | `https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub` |

#### Step 3: Confirm

```
┌─────────────────────────────────────────────┐
│  ✦ Get Near-Human Narration                 │
│                                             │
│  "Attention Is All You Need"                │
│  Vaswani et al.                             │
│                                             │
│  ElevenLabs + Smart Script (Claude)         │
│                                             │
│  ─── Total: ~$0.54 for this paper ───────── │
│                    ℹ️ Cost breakdown          │
│                                             │
│  Charged to your API accounts.              │
│  unarXiv is free.                           │
│                                             │
│  🎁 Everyone who listens to this paper      │
│  benefits from your contribution.           │
│                                             │
│        [← Back]   [Start Narration →]       │
└─────────────────────────────────────────────┘
```

The ℹ️ "Cost breakdown" expands to: "Script AI (Claude): ~$0.04 / Voice (ElevenLabs): ~$0.50." For unified-key options: "Script AI + Voice (OpenAI): ~$0.38."

#### Returning User Flow (keys already stored)

Returning users see Step 1 with their stored options highlighted:

```
┌─────────────────────────────────────────────┐
│  ✦ Get Near-Human Narration                 │
│                                             │
│  All options include AI-enhanced scripting  │
│  ℹ️                                         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★ unarXiv Voice + Smart Script   │    │
│  │ Same voice, smarter script.         │    │
│  │              ~$0.04 for this paper  │    │
│  │                          ✓ Ready    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌═════════════════════════════════════┐    │
│  ║ ★★★★★ ElevenLabs + Smart Script    ║    │
│  ║ Near-human narration.               ║    │
│  ║              ~$0.54 for this paper  ║    │
│  ║                          ✓ Ready    ║    │
│  └═════════════════════════════════════┘    │
│             ↑ your last selection            │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ★★★★ OpenAI Voice + Smart Script   │    │
│  │ Natural, clear narrator.            │    │
│  │              ~$0.38 for this paper  │    │
│  │                 requires OpenAI key │    │
│  │                        [add key]    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ... (other options)                        │
│                                             │
│               [Manage keys]                 │
└─────────────────────────────────────────────┘
```

**Design notes for the returning flow:**

- **Same Step 1 screen**, but with status badges on each card:
  - **"✓ Ready"** — User has all keys needed for this option. One click → skip Step 2, go straight to Step 3 (confirm).
  - **"requires [provider] key" + [add key]** — User is missing a key for this option. Clicking the card or "add key" goes to Step 2 for key entry.
- **The user's last selection is visually highlighted** (bold border, "your last selection" label) and pre-selected. If they just want to repeat what they did before, it's one click to confirm.
- **"Manage keys"** at the bottom opens a key management view where users can re-enter, test, or delete stored keys.
- Keys are auto-validated on modal open (background `POST /api/keys/validate`). If a key is invalid/expired, its card shows "⚠ key expired" instead of "✓ Ready."
- **One-click path for repeat users:** Click their highlighted option → Step 3 confirm → done. Two clicks total.

#### Key UX Details (all steps)

- Progressive disclosure throughout: key storage policy (ℹ️ "Key storage"), script improvement details (ℹ️ on "AI-enhanced scripting"), and cost breakdowns (ℹ️ "Cost breakdown") are behind info buttons. Default view shows only what's needed to decide and act.
- **No voice selection within providers for V1.** Each TTS provider uses a sensible default voice. Voice selection can be added later.

### 5.3 Progress — Reuse Existing UI

**No separate premium progress UI.** When premium narration starts, the paper enters `narrating` status and uses the exact same "Narrating..." spinner + ETA countdown that free narration uses. The existing `NarrationProgress` component handles everything.

The only visual difference: a small amber/gold accent on the narration button while a premium job is in progress (subtle indicator that this is a premium narration). After the modal closes (user can close immediately), the paper card and detail page show the standard narrating state.

### 5.4 Quality Indicators

All quality indicators are understated — quality speaks for itself.

**Paper card:**
- Tiny star/sparkle badge (✦) on the audio icon for papers with premium narration. Amber color, small enough to not dominate the card.

**Paper detail page — play button area:**
- Tiny "Premium" subtext below the play button (or next to duration) when playing a premium version.
- No separate label for free — absence of the badge means standard quality.

**Audio player (PlayerBar):**
- When playing a premium narration, a small ✦ icon appears near the paper title in the player bar. That's it — no text banner, no "Playing premium narration by ElevenLabs."

**Script viewer:**
- The script view (`/s?id=...`) shows the best available script by default.
- If both free and premium scripts exist, a small toggle lets users switch between them for comparison.
- A subtle label: "Improved script · Mar 20, 2026" appears when viewing the premium version.

### 5.5 Audio URL Resolution

The `audioUrl()` function in `lib/api.ts` stays unchanged — it hits `/api/papers/:id/audio`, which goes through the Worker. The Worker is updated to serve the best version:

```typescript
async function handleGetAudio(env: Env, id: string, versionId?: number): Promise<Response> {
  // If specific version requested, serve that
  // Otherwise, check best_version_id on the paper
  // Fall back to the legacy audio_r2_key
}
```

The existing `AudioContext.tsx` needs zero changes for basic playback. It automatically gets the best version.

---

## 6. Provider Support

### 6.1 Unified-Key vs. Dual-Key Providers

A key architectural distinction: some providers offer **both LLM and TTS** from a single API key, while others are TTS-only and need a separate LLM key.

| Provider | LLM | TTS | Keys Needed | Notes |
|----------|-----|-----|-------------|-------|
| **OpenAI** | GPT-4o (Chat Completions) | OpenAI TTS (Audio API) | **1** | Same API key covers both endpoints |
| **Google** | Gemini 2.0 Flash (GenAI) | Google Cloud TTS | **1** | Same Google AI key covers both services |
| **Anthropic** | Claude Sonnet 4.5 | *(no TTS)* | 1 (LLM only) | Available as LLM provider for dual-key options |
| **ElevenLabs** | *(no LLM)* | ElevenLabs v2 | **2** (+ LLM key) | TTS-only; user selects a separate LLM provider |
| **Amazon Polly** | *(no LLM)* | Polly Neural | **2** (+ LLM key) | TTS-only; user selects a separate LLM provider |
| **Azure Speech** | *(no LLM)* | Azure Neural TTS | **2** (+ LLM key) | TTS-only; user selects a separate LLM provider |

This distinction drives the entire UX: unified-key providers (OpenAI, Google) offer a dramatically simpler experience (one key, one provider to manage), while dual-key providers (ElevenLabs, Polly, Azure) offer more flexibility at the cost of extra setup.

### 6.2 TTS Provider Comparison

| Provider | Quality | Price (per 1K chars) | Default Voice | Notable Features |
|----------|---------|---------------------|---------------|-----------------|
| **ElevenLabs** | ★★★★★ | ~$0.30 | "Adam" (deep, warm) | Best expressiveness; multilingual v2; voice cloning available |
| **OpenAI TTS** | ★★★★½ | ~$0.015 | "nova" (clear, warm) | Excellent quality for price; same key as LLM; 6 built-in voices |
| **Google Cloud TTS** | ★★★★ | ~$0.016 | Studio voice (en-US) | Studio & Journey voices; excellent pronunciation; same key as LLM |
| **Amazon Polly** | ★★★★ | ~$0.016 | "Matthew" (Neural) | Generative engine; low latency; good for long-form; SSML support |
| **Azure Speech** | ★★★★ | ~$0.016 | "en-US-JennyMultilingualNeural" | HD voices; excellent prosody; audio content creation tier available |
| *Free tier (edge-tts)* | ★★★ | Free | en-US-JennyNeural | Current default; good but less expressive |

All five premium options are meaningfully superior to the free tier. ElevenLabs is the standout in expressiveness and naturalness but costs ~18× more per character. OpenAI TTS is a strong value play — quality rivaling ElevenLabs at cloud-tier pricing, with the simplicity of a unified key. The three remaining cloud providers are similarly priced and all produce high-quality neural speech.

### 6.3 TTS Provider Interface

```python
from abc import ABC, abstractmethod

class TTSProvider(ABC):
    @abstractmethod
    def synthesize(self, text: str) -> tuple[bytes, float]:
        """Returns (mp3_bytes, cost_usd)."""
        ...

    @abstractmethod
    def max_chunk_chars(self) -> int:
        """Max characters per API request."""
        ...

class ElevenLabsTTS(TTSProvider):
    def __init__(self, api_key: str, voice_id: str = "pNInz6obpgDQGcFmaJgB"):
        self.client = ElevenLabs(api_key=api_key)
        self.voice_id = voice_id

    def synthesize(self, text: str) -> tuple[bytes, float]:
        chunks = split_for_tts(text, self.max_chunk_chars())
        segments = []
        for chunk in chunks:
            audio = self.client.text_to_speech.convert(
                voice_id=self.voice_id, text=chunk,
                model_id="eleven_multilingual_v2",
                output_format="mp3_44100_128",
            )
            segments.append(audio)
        cost = len(text) * 0.30 / 1000
        return concatenate_audio(segments), cost

    def max_chunk_chars(self) -> int:
        return 5000

class OpenAITTS(TTSProvider):
    """OpenAI Audio API — same key as the LLM (Chat Completions)."""
    def __init__(self, api_key: str, voice: str = "nova"):
        self.client = OpenAI(api_key=api_key)
        self.voice = voice

    def synthesize(self, text: str) -> tuple[bytes, float]:
        chunks = split_for_tts(text, self.max_chunk_chars())
        segments = []
        for chunk in chunks:
            response = self.client.audio.speech.create(
                model="tts-1-hd",
                voice=self.voice,
                input=chunk,
                response_format="mp3",
            )
            segments.append(response.content)
        cost = len(text) * 0.015 / 1000  # $15/1M chars
        return concatenate_audio(segments), cost

    def max_chunk_chars(self) -> int:
        return 4096

class GoogleCloudTTS(TTSProvider):
    # Uses google-cloud-texttospeech, Studio voices
    # Same Google AI key works for both Gemini LLM and Cloud TTS
    ...

class AmazonPollyTTS(TTSProvider):
    # Uses boto3 Polly client, Neural/Generative engine
    ...

class AzureSpeechTTS(TTSProvider):
    # Uses azure-cognitiveservices-speech SDK
    ...

TTS_PROVIDERS = {
    "elevenlabs": ElevenLabsTTS,
    "openai-tts": OpenAITTS,
    "google-tts": GoogleCloudTTS,
    "amazon-polly": AmazonPollyTTS,
    "azure-speech": AzureSpeechTTS,
}
```

Adding a new TTS provider is a single class implementing `synthesize()` and a one-line registration in `TTS_PROVIDERS`.

### 6.4 LLM Provider Defaults

| Provider | Default Model | Context Window | Approx. Cost (per 1K input tokens) | Also offers TTS? |
|----------|--------------|----------------|-------------------------------------|-------------------|
| **Anthropic** | claude-sonnet-4-5 | 200K | $3.00 input / $15.00 output | No |
| **OpenAI** | gpt-4o | 128K | $2.50 input / $10.00 output | **Yes** (same key) |
| **Google** | gemini-2.0-flash | 1M | $0.10 input / $0.40 output | **Yes** (same key) |

Google Gemini is the cost-effective choice for script improvement (10-30× cheaper than Claude/GPT). The quality difference for this specific task (improving an already-structured script) is likely small, but we should validate this with A/B testing after launch.

OpenAI and Google appear in both LLM and TTS roles — when selected as a unified-key option, one key covers both. Anthropic is LLM-only and is available as the LLM provider for dual-key TTS options (ElevenLabs, Polly, Azure) or the free-voice option.

### 6.5 Adding New Providers

Adding a new LLM or TTS provider requires:

1. **Modal**: Implement the provider interface class (`LLMProvider` or `TTSProvider`) and register in the providers dict.
2. **Worker**: Add the provider to the validation logic (key validation endpoint).
3. **Frontend**: Add the provider to the `PROVIDERS` config object (name, key URL, icon).

No database changes needed — provider names are freeform TEXT columns validated in the application layer.

---

## 7. Edge Cases & Challenges

### 7.1 Failure Scenarios

**Premium narration fails entirely:**

- The `narration_versions` row is updated to `status = 'failed'` with `error_message`.
- The paper's `best_version_id` is NOT changed — the free version continues to serve.
- The paper returns to its normal state (narrated with free, or unnarrated). No permanent indication of failure clutters the UI.
- No charges are reversed automatically (the LLM/TTS provider charged the user's account directly). The error message should help users understand which stage failed so they can assess cost impact.

**LLM scripting succeeds but TTS fails:**

- The improved script IS saved to R2 (it has standalone value).
- A `narration_versions` row is created with `script_tier = 'premium'`, `audio_tier = 'free'`, `quality_rank = 1`, and `status = 'failed'` since audio wasn't produced.
- Future enhancement: "Retry TTS only" option that re-uses the saved premium script without re-running the LLM (saving the user money). The data model already supports this.

**User's API key has insufficient credits:**

- Key validation catches some cases (e.g., ElevenLabs returns character quota in `/v1/user`).
- If credits run out mid-narration, the provider returns an error. The Modal worker catches this, saves progress, and reports the specific error.
- Error message is actionable: "ElevenLabs API returned: Insufficient character quota. Please add credits at elevenlabs.io/subscription."

**Invalid API key:**

- Caught during the "Test" step in the modal (before any narration starts).
- Also validated by the Worker before dispatching to Modal.
- Error: "API key validation failed for [provider]. Please check your key."

### 7.2 Concurrency

**Concurrent premium requests for the same paper:**

- The Worker checks for an existing `pending` or `processing` premium version for the paper before creating a new one.
- If found: return `409 Conflict` with "Premium narration already in progress for this paper."
- Different users can't accidentally double-pay for the same paper.

**Premium narration while free narration is in progress:**

- Allowed. They are independent versions. The free narration continues on its own pipeline.
- Both versions are stored when complete. The higher-quality one becomes `best_version_id`.

**Race between free narration completing and premium becoming "best":**

- The `best_version_id` update uses an atomic `UPDATE ... WHERE best_version_id IS NULL OR (SELECT quality_rank FROM narration_versions WHERE id = best_version_id) < ?` pattern.
- A free completion (rank 0) won't overwrite a premium completion (rank 3).

### 7.3 Existing Papers

**Papers already narrated with free TTS:**

- The free narration is untouched. Premium narration adds a new version alongside it.
- When premium completes, `best_version_id` is updated, and all users immediately get the premium version on next play.

**Papers not yet narrated:**

- The premium modal is still available. Eager scripting should have a base script ready. The LLM improves it, then premium TTS synthesizes it.
- Separately, if the user also clicks "Narrate" (free), both pipelines run independently.

### 7.4 Client-Side Concerns

**What if someone clears localStorage?**

- Encrypted keys are gone. The user must re-enter and re-encrypt keys next time.
- No data loss on the server side — completed narrations are permanent.
- The UI should make this clear: "Your keys are stored in this browser."

**Multiple devices:**

- Encrypted keys sync via the sync URL (see §3.4). If the user generated a sync URL after saving keys, those keys are available on any synced device.
- If keys were added after the last sync, the user needs to re-sync.

**Browser incognito/private mode:**

- `localStorage` in incognito is isolated and cleared when the window closes.
- The modal detects this heuristically and notes: "You're in a private window. Your keys won't be saved."

**ENCRYPTION_KEY rotation:**

- If the Worker's `ENCRYPTION_KEY` is rotated (e.g., for security hygiene), all existing ciphertext in localStorage becomes undecryptable.
- Users see a "Key expired — please re-enter" message and re-encrypt their keys with the new secret.
- This is a rare event and acceptable UX.

### 7.5 Additional Considerations

**Cost accountability and tracking:**

- Cost estimates are displayed before confirmation as a range.
- Actual costs are tracked in the `narration_versions` table (`llm_cost_usd`, `tts_cost_usd`, `total_cost_usd`) as reported by the Modal worker.
- Over time, this data improves estimate accuracy (we can compare estimated vs. actual and adjust multipliers).
- Admin dashboard can show aggregate spend statistics across all premium narrations.

**Abuse vector — using someone else's leaked keys:**

- unarXiv cannot distinguish between a key owner and someone using a leaked key.
- This is inherent to any system that accepts user-provided keys.
- Mitigation: the community-benefit model means even "abused" keys produce public goods (narrations). The key owner's provider dashboard shows usage, and they can revoke the key.

**Content moderation:**

- The LLM script improvement could theoretically produce inappropriate content if the academic paper contains sensitive material.
- Mitigation: the LLM prompt explicitly instructs "preserve all factual content" and the input is always an academic paper. The risk is very low.

**Transcript versioning for the script viewer:**

- The script page (`/s?id=...`) shows the best available script by default.
- A version selector (toggle) lets users compare free vs. premium scripts.
- The script URL accepts a version param: `/s?id=2302.00672&v=42`.

---

## 8. Implementation Plan

### Phase 1: Eager Scripting & Data Model (Estimated: 1 week)

**Changes:**
- `schema.sql` — Add `narration_versions` table, `best_version_id`/`script_status`/`script_char_count` columns to `papers`
- `worker/src/db.ts` — CRUD functions for narration versions; eager script dispatch on paper insert
- `worker/src/index.ts` — New endpoints: `/narrate-premium`, `/estimate`, `/versions`, `/keys/encrypt`, `/keys/validate`
- `worker/src/index.ts` — Update `handleGetAudio` and `handleGetTranscript` to support versions
- `worker/src/crypto.ts` — AES-256-GCM encrypt/decrypt utilities
- Migration script for existing narrated papers
- `ENCRYPTION_KEY` Worker secret setup

**Complexity:** Medium-high. Eager scripting is a behavioral change to the paper submission flow. The migration for existing papers needs careful testing.

**Files affected:**
- `unarxiv-web/schema.sql`
- `unarxiv-web/worker/src/db.ts`
- `unarxiv-web/worker/src/index.ts`
- `unarxiv-web/worker/src/types.ts`
- `unarxiv-web/worker/src/crypto.ts` (new)
- `unarxiv-web/worker/wrangler.production.toml` (new secret)

### Phase 2: Modal Premium Pipeline (Estimated: 1.5 weeks)

**Changes:**
- `modal_worker/narrate.py` — New `narrate_paper_premium` function; script-only mode for eager scripting
- `modal_worker/premium_tts.py` (new) — TTS provider interface + OpenAI TTS, ElevenLabs, Google Cloud TTS, Amazon Polly, Azure Speech implementations
- `modal_worker/premium_llm.py` (new) — LLM provider interface + Anthropic, OpenAI, Google implementations
- Updated Modal image with premium dependencies
- Webhook callback extended to include `version_id` and actual costs

**Complexity:** Medium-high. Five TTS providers and three LLM providers need integration and testing. OpenAI and Google serve dual roles (LLM + TTS with one key). LLM prompt engineering for script improvement will need iteration.

**Files affected:**
- `unarxiv-web/modal_worker/narrate.py`
- `unarxiv-web/modal_worker/premium_tts.py` (new)
- `unarxiv-web/modal_worker/premium_llm.py` (new)
- `unarxiv-web/modal_worker/requirements.txt`

### Phase 3: Frontend — Premium Modal & Encrypted Key Management (Estimated: 1.5 weeks)

**Changes:**
- `PremiumNarrationModal.tsx` (new) — Three-step modal: option selection (cost-first) → key entry (adapts to unified/dual/free-voice) → confirm
- `encryptedKeys.ts` (new) — Encrypted key management (encrypt via API, store ciphertext in localStorage by provider name, send ciphertext for validation/narration)
- `PaperActionsMenu.tsx` — Add "✦ Get Near-Human Narration" menu item
- `PaperPageContent.tsx` — Wire up the modal
- `lib/api.ts` — New API functions for premium endpoints, key management
- Quality badges (sparkle on paper cards, subtle "Premium" subtext on detail page, ✦ in player bar)

**Complexity:** Medium-high. The modal with multi-provider support, encrypted key management, and cost estimation is the most complex UI addition.

**Files affected:**
- `unarxiv-web/frontend/src/components/PremiumNarrationModal.tsx` (new)
- `unarxiv-web/frontend/src/lib/encryptedKeys.ts` (new)
- `unarxiv-web/frontend/src/components/PaperActionsMenu.tsx`
- `unarxiv-web/frontend/src/components/PaperActionButton.tsx`
- `unarxiv-web/frontend/src/app/p/PaperPageContent.tsx`
- `unarxiv-web/frontend/src/components/PaperCard.tsx`
- `unarxiv-web/frontend/src/components/PlayerBar.tsx`
- `unarxiv-web/frontend/src/app/s/page.tsx` (script viewer toggle)
- `unarxiv-web/frontend/src/lib/api.ts`

### Phase 4: Testing & Launch (Estimated: 1 week)

- End-to-end testing with real API keys (developer accounts) for all 8 providers (3 LLM + 5 TTS including OpenAI TTS)
- Cost estimate accuracy validation (compare estimates vs. actual costs)
- Error path testing (invalid keys, insufficient credits, provider downtime, network failures)
- Security review of encryption flow (encrypt → store → decrypt → dispatch)
- Sync URL testing with encrypted key blobs
- **Ship visible from day one** — no feature flag. The menu item appears for all users immediately.

---

## 9. Future Considerations

**Not in scope for V1 but worth designing for:**

- **Voice selection UI**: Let users choose from a curated list of voices per TTS provider, with audio previews. The provider interface already supports custom voice IDs.
- **Voice cloning**: Users upload a voice sample → ElevenLabs creates a custom voice. Voice ID stored in encrypted localStorage.
- **Batch premium narration**: Upgrade all papers in a collection at once.
- **"Retry TTS only"**: If LLM succeeded but TTS failed, re-use the saved premium script with a different TTS provider or after adding credits.
- **Premium narration "gifting"**: A user pays to upgrade a paper and gets attribution ("Premium narration contributed by @username").
- **Subscription model**: unarXiv holds API accounts and bills users directly. Significant business model shift.
- **Quality feedback loop**: Use ratings on premium vs. free narrations to refine the LLM improvement prompt and provider recommendations.
- **Speaker diarization**: Different voices for different sections (abstract, body, equations).
- **Cost pooling**: Multiple users split the cost of a premium narration.

---

## Appendix A: localStorage Key Schema

```typescript
// Encrypted API keys — keyed by provider name, not by role (LLM vs TTS).
// For unified-key providers (openai, google), one entry covers both LLM and TTS.
"unarxiv:ekey:anthropic"      → { cipher: "base64...", hint: "sk-...abc" }
"unarxiv:ekey:openai"         → { cipher: "base64...", hint: "sk-...xyz" }  // covers LLM + TTS
"unarxiv:ekey:google"         → { cipher: "base64...", hint: "AI...789" }  // covers LLM + TTS
"unarxiv:ekey:elevenlabs"     → { cipher: "base64...", hint: "xi-...def" }  // TTS only
"unarxiv:ekey:amazon-polly"   → { cipher: "base64...", hint: "AK...ghi" }  // TTS only
"unarxiv:ekey:azure-speech"   → { cipher: "base64...", hint: "ab...jkl" }  // TTS only

// User's last selected option (for returning user flow)
"unarxiv:premium:last-option" → {
  type: "unified" | "dual" | "free-voice",
  provider?: string,           // for unified: "openai" | "google"
  tts_provider?: string,       // for dual: "elevenlabs" | "amazon-polly" | "azure-speech"
  llm_provider?: string,       // for dual/free-voice: "anthropic" | "openai" | "google"
}
```

The `hint` field stores the last 3-4 characters of the original key (set during encryption) for display purposes only. It lets the user identify which key is saved without exposing the full key.

**Typical storage by option type:**

| Option selected | Keys stored | Total entries |
|----------------|-------------|---------------|
| OpenAI Voice + Smart Script | `ekey:openai` | 1 |
| Google Voice + Smart Script | `ekey:google` | 1 |
| unarXiv Voice + Smart Script (Anthropic) | `ekey:anthropic` | 1 |
| ElevenLabs + Smart Script (Anthropic) | `ekey:elevenlabs` + `ekey:anthropic` | 2 |
| Amazon Polly + Smart Script (Google) | `ekey:amazon-polly` + `ekey:google` | 2 |

Note that `ekey:google` is the same regardless of whether it's used as a unified key (Google Voice option) or as an LLM key (dual-key option like Polly + Gemini). If a user previously saved a Google key for the unified option and later picks Polly + Gemini, the existing key is reused.

## Appendix B: Webhook Callback Extension

The Modal webhook callback (`/api/webhooks/modal`) is extended to handle premium narration completions:

```typescript
interface ModalWebhookBody {
  arxiv_id: string;
  status: string;
  // Existing fields...

  // New premium fields
  version_id?: number;
  script_tier?: string;
  audio_tier?: string;

  // Cost tracking (actual costs from provider APIs)
  llm_cost_usd?: number;
  tts_cost_usd?: number;
  total_cost_usd?: number;
}
```

When `version_id` is present, the webhook handler updates `narration_versions` (including cost columns) instead of the `papers` table. On completion, it recalculates `best_version_id`.

## Appendix C: Sync URL Payload Extension

The existing sync URL payload is extended to carry encrypted key blobs and the user's last option selection:

```typescript
interface SyncPayload {
  user_token: string;
  list_tokens: string[];
  // Encrypted API key blobs — keyed by provider, not role
  encrypted_keys?: {
    [provider: string]: {
      cipher: string;  // AES-256-GCM ciphertext (base64)
      hint: string;    // last 3-4 chars of original key
    };
  };
  // Last selected premium option (for returning user flow)
  last_premium_option?: {
    type: "unified" | "dual" | "free-voice";
    provider?: string;
    tts_provider?: string;
    llm_provider?: string;
  };
}
```

On the receiving device, the encrypted keys are saved directly to localStorage. They can only be decrypted by the Worker (which has the `ENCRYPTION_KEY`), so the sync URL itself doesn't expose plaintext keys even if intercepted.

**Payload size:** Unified-key users add ~150 bytes (one cipher blob + option). Dual-key users add ~300 bytes (two cipher blobs + option). The sync URL remains compact.
