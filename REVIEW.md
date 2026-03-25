# unarXiv Review — 2026-03-25

## Changes Made

### chore(worker): remove unused QUEUE_BATCH_SIZE env var from wrangler.toml

**File:** `unarxiv-web/worker/wrangler.toml`

`QUEUE_BATCH_SIZE = "3"` was listed in wrangler.toml but was removed from the TypeScript `Env` interface in a previous refactor session. The Worker never reads this var, so it has no effect. Removed to keep config in sync with the codebase.

This was noted as a "new observation" in the 2026-03-24 review. Closing it now.

### refactor(worker): remove stale legacy webhook payload compat block

**File:** `unarxiv-web/worker/src/handlers/narration.ts`

The `handleModalWebhook` function contained a ~30-line compatibility block that flattened old nested payload formats (`providers`, `costs` dicts and a `quality_rank`-based `narration_tier` inference). It was written when the Modal worker was mid-migration and marked for removal "after ~1 week."

The 2026-03-24 review flagged this for removal but deferred it pending human confirmation that Modal had fully migrated. Code review of `narrate.py` and the premium narration pipeline in `narrate_paper_premium()` confirms that all `send_status()` calls use flat fields only — no nested `providers`/`costs` dicts are sent anywhere in the current Modal codebase. The compat block was dead code.

Removed:
- The compat block itself (~25 lines)
- The now-unused field declarations from the body type (`script_r2_key`, `providers`, `costs`, `quality_rank`)

No behavior change for any live narration flow.

---

## Left Unchanged (Carried Over — Needs Human Decision)

These items were identified in previous sessions and are explicitly deferred:

- **`DAILY_GLOBAL_LIMIT` / `getGlobalSubmissionCount` not enforced** — The env var is defined and set to `"50"` in wrangler.toml, and `getGlobalSubmissionCount()` exists in `db.ts`, but neither is wired together in any handler. Decide whether to implement the global cap, document it as intentionally unimplemented, or remove the dead infrastructure entirely.

- **`/api/my-additions` GET route with no frontend callers** — Registered and functional in the worker, but the frontend doesn't call it. `handleDeleteMyAddition` (for `DELETE /api/my-additions/:id`) is used by `my-papers` page; the GET endpoint has no caller. Decide whether to build UI for it, keep it unused, or remove it.

- **`admin/page.tsx` size** — Single file of ~1000+ lines. Splitting would improve maintainability but is high blast-radius; deferred for deliberate planning.

- **Design system / shared component library** — No shared `Button`/`Modal` primitives; `shadcn/ui` would reduce modal duplication (`RatingModal` inline in `PaperPageContent.tsx`, `PremiumNarrationModal.tsx` at 1200+ lines) but is a significant dependency addition. Human decision.

- **`RatingModal` inline in `PaperPageContent.tsx`** — The `RatingModal`, `StarIcon`, `StarRatingInput`, `CopyableId`, and `BackButton` sub-components are all defined inline in `PaperPageContent.tsx` (~700 lines total). Each could be extracted to its own file. Deferred as non-urgent and low-risk to leave as-is.

- **`handleReprocessPaper` Modal dispatch duplication** — The inline `fetch` in `handleReprocessPaper` duplicates parts of `dispatchToModal`, but the two paths have meaningfully different behavior (different payload shape including `mode`, different error handling — reprocess does not revert status on failure). Left as-is to avoid over-engineering a one-off admin code path.

---

## New Observations (No Action Required Today)

- **`voiceTiers.ts` and `api.ts` parallel TTS provider lookup functions** — `voiceTiers.ts` exports `getTierFromProvider()` for resolving a TTS provider name to a `VoiceTier`. `api.ts` has a private `ttsProviderToTierId()` that does a similar lookup but returns a string ID for grouping premium estimate options. The two functions have different semantics and are each used in the right place. Acceptable duplication.

- **`recoverStalePapers` hardcoded URL** — `const baseUrl = "https://api.unarxiv.org"` at line 136 of `narration.ts`. This is intentional (the cron runs in production only; Modal must call back to the production API, not localhost), but worth noting for anyone who extends the cron logic.

- **`buildRouteTable` called on every request** — The worker rebuilds the array of ~45 route entries (including `new RegExp(...)` calls) on every request because `baseUrl` is passed per-request. In practice V8 handles this efficiently and the overhead is negligible at the expected request volume; not worth the added complexity of memoizing.

---

## Deploy Status

- **Worker** (`unarxiv-api`): Version `18fc4a30-ac07-4d4e-887d-0e8404976aa3` — deployed 2026-03-25
- **Frontend** (`unarxiv-frontend`): No frontend changes; not redeployed

**Note:** `wrangler.production.toml` (gitignored) still contains `QUEUE_BATCH_SIZE = "3"` — only the committed `wrangler.toml` was updated. Since the Worker never reads this var, the production deploy is unaffected. The production.toml should be cleaned up manually on next access.
