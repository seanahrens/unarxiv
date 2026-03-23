# unarXiv Review — 2026-03-23

## Changes Made

### fix(webhook): handle script_ready status before VALID_STATUSES check

**File:** `unarxiv-web/worker/src/handlers/narration.ts`

The Modal narration worker sends `status="script_ready"` when the LLM script
phase finishes but TTS is still running. The webhook handler had code to record
a partial `narration_version` (so the frontend can preview the transcript early),
but it was placed *after* a VALID_STATUSES guard that only allowed DB-level
statuses (`unnarrated`, `narrating`, `narrated`, `failed`). `script_ready` is a
webhook-only status (never written to the DB), so it was being rejected with a
400 and the partial-version recording never ran.

Fix: move the `script_ready` early-return block and the `script_char_count`
update above the VALID_STATUSES check. The status validation now only applies to
the code path that calls `updatePaperStatus`, which is correct — that path should
only accept statuses that are valid in the DB.

**Impact:** Premium narrations that use the LLM script phase now correctly
populate the transcript in the frontend while TTS is still running.

### fix(narration): use baseUrl param in handleNarratePaper dispatch

**File:** `unarxiv-web/worker/src/handlers/narration.ts`

`handleNarratePaper` accepts a `baseUrl: string` parameter (computed from
`url.origin` in the request handler) for constructing the Modal callback URL.
But the internal dispatch call was passing the hardcoded string
`"https://api.unarxiv.org"` instead of using it. In production this has no
effect, but in local dev with `MODAL_WEBHOOK_SECRET` set (e.g. testing against
real Modal), callbacks would be sent to production instead of the local worker.

Fix: pass `baseUrl` to `dispatchToModal`.

### refactor(narration): remove unused ip variable in handleNarrationCheck

**File:** `unarxiv-web/worker/src/handlers/narration.ts`

`handleNarrationCheck` was extracting the client IP but not using it (Turnstile
is disabled). Removed the unused variable and renamed params to `_request`/`_env`
to make intent clear.

### docs: correct rate limit description in CLAUDE.md

**File:** `CLAUDE.md`

The key config section said "10/day/IP, global daily cap configurable via
`DAILY_GLOBAL_LIMIT`". Two inaccuracies:
1. The actual per-IP default is **24** (controlled by `PER_IP_DAILY_LIMIT`).
2. `DAILY_GLOBAL_LIMIT` is defined in `types.ts` and `wrangler.toml` but is
   **not enforced** in any request handler. The `getGlobalSubmissionCount` DB
   function exists but is never called.

Updated comment to reflect actual behavior.

---

## Left Unchanged (Identified, Needs Human Decision)

- **`DAILY_GLOBAL_LIMIT` / `getGlobalSubmissionCount` not enforced** — the env
  var and DB helper exist but are never wired together. A decision is needed on
  whether to implement the global daily cap or remove the dead infrastructure.
- **Worker unit tests fail against local DB** — `premium.test.ts` fails because
  the local wrangler D1 state is missing `migration 007_narration_tier.sql`
  (the `narration_tier` column). These failures are pre-existing and unrelated
  to today's changes. The fix is to run `npm run db:reset` in the worker
  directory before running tests.
- **`db.ts` and `index.ts` remain large monolithic files** — splitting by domain
  is the right direction but high blast-radius; deferred for deliberate planning.
- **Design system / shared component library** — no shared `Button`/`Modal`
  primitives. shadcn/ui would reduce duplication in modals but is a significant
  dependency addition. Human decision.
- **`/api/my-additions` worker routes** — `GET /api/my-additions` and
  `DELETE /api/my-additions/:id` are still registered with no frontend callers.
  Functional but not wired to UI. Deferred.

---

## Deploy Status

- **Worker** (`unarxiv-api`): Version `e86264a7-d358-4441-a5ca-1d9210e68bd6` — deployed 2026-03-23
- **Frontend** (`unarxiv-frontend`): Deployment `93220449` — deployed 2026-03-23
