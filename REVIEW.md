# unarXiv Review — 2026-03-24

## Changes Made

### docs(claude.md): fix Turnstile code location

**File:** `CLAUDE.md`

The Conventions section referenced `worker/src/index.ts` as the location of the disabled Turnstile bot protection code. This was inaccurate — the worker stub is in `narration.ts` (`handleNarrationCheck`) and the frontend widget lives in `TurnstileWidget.tsx`. Updated the note to point to both.

### fix(worker): log R2 delete errors in `handleDeleteMyAddition`

**File:** `unarxiv-web/worker/src/handlers/user.ts`

`handleDeleteMyAddition` silently swallowed R2 deletion errors (`try { ... } catch {}`), making it impossible to diagnose R2 failures in logs. `handleDeletePaper` already logs these errors with `console.error`. Made the pattern consistent.

No behavior change — the deletion attempt still proceeds and the paper is still removed from the DB regardless of whether R2 cleanup succeeds.

### fix(worker): log R2 delete errors in `handleReprocessPaper`

**File:** `unarxiv-web/worker/src/handlers/narration.ts`

Same issue: both the transcript and audio R2 deletions in `handleReprocessPaper` were silently swallowed. Added `console.error` logging to both catch blocks. Consistent with `handleDeletePaper`.

No behavior change — reprocess still proceeds even if old R2 files can't be deleted.

### refactor(worker): remove redundant intermediate variable in `handleListPapers`

**File:** `unarxiv-web/worker/src/handlers/papers.ts`

```typescript
// Before
const popular = await getPopularPapers(env.DB, perPage, offset);
papers = popular;

// After
papers = await getPopularPapers(env.DB, perPage, offset);
```

The `popular` variable was assigned immediately to `papers` with no intermediate use. Simplified to a direct assignment.

---

## Left Unchanged (Carried Over — Needs Human Decision)

These items were identified in previous sessions and are explicitly deferred for human decision-making:

- **`DAILY_GLOBAL_LIMIT` / `getGlobalSubmissionCount` not enforced** — The env var is defined in `types.ts` (and even set to `"50"` in wrangler), and `getGlobalSubmissionCount()` exists in `db.ts`, but neither is wired together in any handler. Decide whether to implement the global cap, document it as intentionally unimplemented (e.g. "reserved"), or remove the dead infrastructure entirely.

- **Legacy webhook payload flattening in `handleModalWebhook`** — The block flattening nested `providers`/`costs` objects from old Modal payloads has a comment saying to remove it "after ~1 week." That window has almost certainly passed. Needs human confirmation that Modal has fully transitioned to the flat payload format before removal.

- **`/api/my-additions` worker route** — Registered and functional, but no frontend callers. The corresponding `handleDeleteMyAddition` (for `DELETE /api/my-additions/:id`) is used by the `my-papers` page. The `GET /api/my-additions` route has no frontend caller. Decide whether to build UI for it, keep it unused, or remove it.

- **`admin/page.tsx` size** — Single file of ~1000+ lines. Splitting would improve maintainability but is high blast-radius; deferred for deliberate planning.

- **Design system / shared component library** — No shared `Button`/`Modal` primitives; `shadcn/ui` would reduce modal duplication but is a significant dependency addition. Human decision.

---

## New Observations (No Action Required Today)

- **`QUEUE_BATCH_SIZE` env var** — Appears in `wrangler.toml` and `wrangler.production.toml` (set to `"3"`) but was removed from the `Env` TypeScript interface in a prior refactor session. The wrangler config entries are harmless but could be cleaned up. Since they're in wrangler config and not in TypeScript, they don't cause type errors and pose no risk.

- **`VOICE_TIERS` parallel mapping** — `voiceTiers.ts` exports `getTierFromProvider()` for resolving a TTS provider name to a `VoiceTier` object. `api.ts` has a private `ttsProviderToTierId()` that does a similar lookup but returns a string ID for grouping premium estimate options. The two functions have slightly different semantics and both are used in the right places; this duplication is acceptable for now.

---

## Deploy Status

- **Worker** (`unarxiv-api`): Version `ce9e25ff-08f8-4339-897b-8718a4408704` — deployed 2026-03-24
- **Frontend** (`unarxiv-frontend`): Deployment `03fec32d` — deployed 2026-03-24
