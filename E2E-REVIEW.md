# E2E Review — 2026-03-22

**Reviewed:** `unarxiv-web/e2e/` (14 spec files, 51 tests)
**Branch:** `test/e2e-review-2026-03-22`
**Result:** 43 passed, 8 skipped (4 fixme, 1 turnstile, 1 admin-delete, 2 ADMIN_PASSWORD-gated), 0 failures

---

## Coverage Map

| Critical Path | Status |
|---|---|
| Paper discovery — homepage cards | ✅ 04-homepage |
| Paper discovery — arXiv URL formats (/abs/, /html/, /pdf/) | ✅ 02-arxiv-routes |
| Paper discovery — text search (results, AND semantics, no results) | ✅ 06-text-search |
| Paper import via arXiv ID in search | ✅ 03-arxiv-search-import |
| Full narration lifecycle (import → generate → verify audio) | ✅ 11-narration-gen (slow suite) |
| Audio playback — play button starts audio, correct src | ✅ 05-audio-playback |
| Audio playback — PlayerBar appears, speed cycles | ✅ 07-media-player |
| Audio playback — pause/resume/skip/seek | ⚠️ FIXME (headless CI unreliable) |
| Downloads — PDF + audio options in dropdown | ✅ 08-downloads |
| Downloads — audio endpoint returns valid response | ✅ 08-downloads |
| Ratings — full lifecycle (submit, reload, clear) | ✅ 09-ratings |
| Playlist — add and remove via dropdown | ✅ 10-playlist |
| Playlist — state persists across page reload | ✅ 10-playlist — NEW |
| Collections — full API lifecycle (CRUD, reorder, auth, my-lists) | ✅ 13-lists (API) |
| Collections — /l/<id> short URL redirect | ✅ 13-lists (Frontend) — NEW |
| Collections — frontend create + view | ✅ 13-lists (Frontend) |
| Collections — admin see all lists | ✅ 13-lists (Admin, skipped if no ADMIN_PASSWORD) |
| Transcript viewer — page loads, API returns text | ✅ 14-transcript |
| Admin auth — password gate, wrong password rejected | ✅ 01-admin-auth |
| Admin auth — correct password shows dashboard | ✅ 01-admin-auth — NEW (skipped without ADMIN_PASSWORD) |
| Admin auth — API auth rejection (missing/wrong) | ✅ 01-admin-auth |
| Admin curate bulk actions (delete, reprocess) | ❌ Not covered |
| Premium narration upgrade flow | ❌ Not covered |
| Error states — invalid arXiv ID, failed narration | ❌ Not covered |

## Performance

Fast suite: **~8 seconds** (unchanged from yesterday). The media player `beforeEach` restructuring prevents 4 fixme tests from running `startAudioPlayback` unnecessarily — this avoids ~4 wasted page navigations per run in CI.

## What Changed

### 1. `helpers/fixtures.ts` — Add shared selectors
Added `DOWNLOAD_PDF`, `DOWNLOAD_AUDIO`, `REMOVE_FROM_PLAYLIST`, and `RATING_MODAL` as shared exports. These were previously re-declared inline in individual test files (DRY violation).

### 2. `08-downloads.spec.ts` — Import from fixtures
Replaced locally declared `DOWNLOAD_PDF`/`DOWNLOAD_AUDIO` constants with imports from `helpers/fixtures.ts`.

### 3. `09-ratings.spec.ts` — Import from fixtures, fix modal fallback
Replaced `RATE_NARRATION_BTN` (local duplicate of `RATE_NARRATION`) and `RATING_MODAL` with imports from fixtures. The `RATING_MODAL` fallback was `'.fixed.inset-0'` (matches any element with those two classes). Improved to `'div.fixed.inset-0'` (requires element to be a div). Note: `data-testid="rating-modal"` is already deployed so fallback is rarely used.

### 4. `10-playlist.spec.ts` — Optimize beforeEach, import from fixtures, add persistence test
- `beforeEach` was navigating to `/` just to call `localStorage.clear()`, then each test navigated again to the paper page (2 navigations per test). Fixed to navigate directly to the paper page in `beforeEach`.
- Replaced locally declared `ADD_TO_PLAYLIST`/`REMOVE_FROM_PLAYLIST` with fixture imports.
- Added `"playlist state persists across page reload"` — verifies `localStorage`-backed playlist state survives a full reload (was flagged as missing in yesterday's review).

### 5. `07-media-player.spec.ts` — Split fixme tests into separate describe
The original `beforeEach` called `startAudioPlayback` for all 6 tests including 4 that are `test.fixme()`. Fixme tests still run setup. Restructured into two describe blocks: the 2 active tests keep `beforeEach`; the 4 fixme tests are in a separate describe (no beforeEach) and call `startAudioPlayback` directly if ever un-fixme'd.

### 6. `13-lists.spec.ts` — Add /l/<list_id> short URL test
Added test verifying that `/l/LIST_ID` redirects to `/l?id=LIST_ID`. The Cloudflare Pages function (`functions/l/[[path]].ts`) implements this, but it had no E2E coverage. Note: Cloudflare removes the trailing slash from the intermediate redirect target (`/l/?id=...` → `/l?id=...`), which the test regex accommodates.

### 7. `01-admin-auth.spec.ts` — Add admin login success test
Added `"correct password grants access to admin dashboard"` — the previous test suite only verified failure paths. Test is skipped when `ADMIN_PASSWORD` is not set in the environment.

### 8. `TEST_SPEC.md` — Sync to current coverage
Added new tests and the `/l/<list_id>` short URL entry.

## Deploy Status

No frontend source files were modified. Frontend deploy skipped — nothing to deploy.

- ✅ Merged to `main` and pushed to origin (`8136499`)

## Items Needing Human Decision

1. **Pause/resume/skip/seek fixme tests** — 4 media player tests remain fixme'd because headless CI can't reliably stream audio from production. Could be addressed with `page.route()` to stub the audio response, but that's significant work. Low priority since the PlayerBar rendering and speed cycle tests cover the UI.

2. **Premium narration upgrade flow** — Added in `064a7c4`, no E2E coverage exists. Involves clicking paid upgrade options. Adding coverage requires determining whether production can be tested without actual purchases (e.g., stub via API mock or a test mode).

3. **Error state coverage** — Invalid arXiv IDs, failed narration UI, and network errors are untested. Low-effort to add but requires a known "failed" paper fixture or API mocking.

4. **Admin curate bulk actions** — `/admin/curate` has no E2E test. Could be added as `test.skip(!ADMIN_PASSWORD, ...)` similar to existing admin tests. Needs team decision on scope.
