# Daily Codebase Review — 2026-03-27

## Changes Made

### 1. Remove legacy route aliases (worker)
**File**: `unarxiv-web/worker/src/index.ts`

Removed two route aliases that were added as a safety net during the rename of the "premium" feature to "upgrade":
- `DELETE /api/admin/papers/:id/premium-versions` → alias for `upgrade-versions`
- `POST /api/papers/:id/narrate-premium` → alias for `narrate-upgrade`

Both were marked "remove after next frontend deploy." The frontend has been deployed using the new routes across many subsequent iterations. These aliases are no longer needed.

### 2. Remove unused wrangler config variable (attempted, skipped)
`QUEUE_BATCH_SIZE = "3"` in `wrangler.production.toml` is never read by any worker code. However, `wrangler.production.toml` is listed in `.gitignore` and cannot be committed. **Action required**: manually remove `QUEUE_BATCH_SIZE` from `wrangler.production.toml`.

### 3. Simplify PaperCard failed status label (frontend)
**File**: `unarxiv-web/frontend/src/components/PaperCard.tsx`

`STATUS_LABELS` was a table with empty strings for `unnarrated`, `narrating`, and `narrated`, and `"Failed"` for the failed status. The table was only consulted inside `{isFailed && ...}`, making the lookup always return `"Failed"`. Replaced the indirection with the inline string.

### 4. Fix CLAUDE.md modal_worker documentation
**File**: `CLAUDE.md`

- Removed mention of `legacy_regex_scripter.py` — the source file no longer exists (only a stale `.pyc` cache remains in `__pycache__/`).
- Added missing `hybrid_scripter/` directory to the architecture listing.
- Clarified that `regex_scripter/` is used in both base and hybrid modes (not just the default mode).

---

## Items Left Unchanged

### Pre-existing test failures (9 tests in `worker/src/__tests__/upgrade.test.ts`)
These failures exist on `main` before this review:

1. **Schema out-of-sync**: Tests error with `D1_ERROR: no such column: error_category` because the test helper's inline schema (`TEST_SCHEMA` in `src/__tests__/helpers.ts`) is missing the `error_category` and `retry_count` columns that were added in a later migration. Fixing requires updating the test schema.

2. **Cost estimate mismatch**: One test expects `script_char_count` to be `50000` but gets `66500`, indicating a drift between the estimation formula and the test fixture.

These are test infrastructure issues — the tests need to be updated to match the current schema and cost formula. Per review constraints, test files are not modified by this agent.

### `DAILY_GLOBAL_LIMIT` in Env type and wrangler config
Documented in CLAUDE.md as "not currently enforced in code." Left as-is since it's an intentional future placeholder already called out in the docs.

### `buildRouteTable` called per request
The route table (including RegExp compilation) is rebuilt on every incoming request. For CF Workers this is low-cost (Workers isolates are long-lived), but a module-level cached table would be marginally more efficient. Not worth the refactor at current scale.

### Admin page size (1776 lines)
`admin/page.tsx` is large but well-organized with clearly separated sub-components and helper functions. No immediate split is warranted — splitting would add indirection without clarity at this stage.

---

## Deploy Status

| Service | Status |
|---------|--------|
| Worker (`unarxiv-api`) | ✅ Deployed successfully (Version: `d2d4e7e8-5031-47cb-aefe-5c7f61315375`) |
| Frontend (`unarxiv-frontend`) | ❌ Deploy failed — Cloudflare Pages API returned 502/504 Gateway Timeout on all three attempts. This is a transient Cloudflare infrastructure issue, not a code problem. The frontend build succeeded cleanly. Retry: `cd unarxiv-web/frontend && npx wrangler pages deploy out --project-name=unarxiv-frontend` |

---

## Human Decision Required

None — all changes are straightforward cleanup. The pre-existing test failures require a human to update `src/__tests__/helpers.ts` with the current schema (adding `error_category TEXT` and `retry_count INTEGER NOT NULL DEFAULT 0` to the papers table) and correct the cost estimate fixture.
