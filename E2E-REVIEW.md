# E2E Review — 2026-03-21

**Reviewed:** `unarxiv-web/e2e/` (14 spec files, 48 tests)
**Branch:** `test/e2e-review-2026-03-21`
**Result:** 41 passed, 7 skipped (5 fixme, 1 turnstile, 1 admin-password), 0 failures

---

## Coverage Map

| Critical Path | Status |
|---|---|
| Paper discovery — homepage cards | ✅ 04-homepage |
| Paper discovery — arXiv URL formats (/abs/, /html/, /pdf/) | ✅ 02-arxiv-routes |
| Paper discovery — text search (results, AND semantics, no results) | ✅ 06-text-search |
| Paper import via arXiv ID in search | ✅ 03-arxiv-search-import |
| Full narration lifecycle (import → generate → verify audio) | ✅ 11-narration-gen (slow suite) |
| Audio playback — play button starts audio | ✅ 05-audio-playback |
| Audio playback — correct audio src | ✅ 05-audio-playback |
| Audio playback — PlayerBar appears, speed cycles | ✅ 07-media-player |
| Audio playback — pause/resume/skip/seek | ⚠️ FIXME (headless CI unreliable) |
| Downloads — PDF + audio options in dropdown | ✅ 08-downloads |
| Downloads — audio endpoint returns valid response | ✅ 08-downloads |
| Ratings — full lifecycle (submit, reload, clear) | ✅ 09-ratings |
| Playlist — add and remove via dropdown | ✅ 10-playlist |
| Collections — full API lifecycle (CRUD, reorder, auth, my-lists) | ✅ 13-lists (API) |
| Collections — frontend create + view | ✅ 13-lists (Frontend) |
| Collections — admin see all lists | ✅ 13-lists (Admin, skipped if no ADMIN_PASSWORD) |
| Transcript viewer — page loads, API returns text | ✅ 14-transcript |
| Admin auth — password gate, wrong password rejected | ✅ 01-admin-auth |
| Admin auth — API auth rejection (missing/wrong) | ✅ 01-admin-auth |
| Error states — invalid arXiv ID, failed narration | ❌ Not covered |
| Admin curate bulk actions (delete, reprocess) | ❌ Not covered (requires auth in CI) |
| Playlist persistence across page reload | ❌ Not covered |

## What Changed

### 1. `07-media-player.spec.ts` — Remove duplicated selector constants
The file defined `SPEED_BTN` and `PLAY_PAUSE_BTN` locally, identical to `PLAYER_SPEED` and `PLAYER_PLAY_PAUSE` already exported from `helpers/fixtures.ts`. Removed the duplicates and imported from fixtures. `PLAY_PAUSE_BTN` was not even used in the file body.

### 2. `01-admin-auth.spec.ts` — Stabilize error selector
The wrong-password test used `.text-red-600` (a Tailwind class) which would break if the palette changed. Updated to prefer `[data-testid="admin-auth-error"]` with `.text-red-600` as a fallback.

### 3. `admin/page.tsx` — Add `data-testid="admin-auth-error"`
Added the matching `data-testid` to the auth error paragraph so the test's preferred selector works post-deploy.

### 4. `TEST_SPEC.md` — Sync with current app state
Fixed three stale references:
- Status was `not_requested` → corrected to `unnarrated`
- Route was `/playlist` → corrected to `/my-papers`
- Section label was `"Papers I Added"` → corrected to `"My Collections"`
- Removed a spec entry for `/admin/curate` (no separate route exists; curate view lives at `/admin`)

## Performance

Test run time unchanged: 48 tests in ~8s (fast suite). No new page navigations added.

## Deploy Status

- ✅ Merged to `main` and pushed to origin
- ✅ Frontend deployed to Cloudflare Pages (`unarxiv-frontend`)

## Items Needing Human Decision

1. **Pause/resume/skip/seek tests are fixme'd** — Four media player tests are marked `test.fixme` because headless CI can't reliably stream audio. Could be addressed with a MSE/audio mock, but that's significant work.

2. **Error states not covered** — Invalid arXiv IDs, failed narration states, and network error handling have no E2E coverage. Would require either API mocking or a known failed-paper fixture.

3. **Playlist reload persistence not covered** — The playlist tests pre-populate localStorage but don't verify the state survives a full page reload. Could be added as a single extra assertion in 10-playlist.

4. **Admin bulk actions not covered** — Reprocess and bulk delete require a valid admin password. Could be added as `test.skip(!ADMIN_PASSWORD, ...)` tests, similar to the existing admin list test.
