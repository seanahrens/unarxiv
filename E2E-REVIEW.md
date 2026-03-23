# E2E Review — 2026-03-23

**Reviewed:** `unarxiv-web/e2e/` (14 spec files, 52 tests)
**Branch:** `test/e2e-review-2026-03-23`
**Result:** 44 passed, 8 skipped (4 fixme, 1 turnstile, 1 admin-delete, 2 ADMIN_PASSWORD-gated), 0 failures

---

## Summary

4 issues identified and fixed. All 44 fast-suite tests pass. Frontend deployed.

---

## Coverage Map

| Critical Path | Status |
|---|---|
| Paper discovery — homepage, paper cards | ✅ Covered (04-homepage) |
| Paper discovery — text search | ✅ Covered (06-text-search) |
| Paper discovery — arXiv URL formats (/abs, /pdf, /html) | ✅ Covered (02-arxiv-routes) |
| Paper import via arXiv ID search | ✅ Covered (03-arxiv-search-import) |
| Narration generation (slow path) | ✅ Covered (11-narration-gen, full suite only) |
| Audio playback — play, speed control | ✅ Covered (05-audio-playback, 07-media-player) |
| Downloads — PDF, MP3 | ✅ Covered (08-downloads) |
| Ratings — full lifecycle | ✅ Covered (09-ratings) |
| Playlists — add, remove, persist | ✅ Covered (10-playlist) |
| Collections/Lists — CRUD, reorder, share URL, delete | ✅ Covered (13-lists) |
| Cross-route "Newly Added" navigation | ✅ **Newly added** (04-homepage) |
| Admin auth — password gate, wrong/correct password | ✅ Covered (01-admin-auth) |
| Transcript viewer | ✅ Covered (14-transcript) |
| Homepage "Newly Added" button visibility | ✅ **Newly added** (04-homepage) |
| Premium narration modal | ⬜ Not covered (complex UI, low E2E ROI) |
| Admin bulk actions (new premium tier filters) | ⬜ Not covered (admin-only, integration-tested manually) |
| Error states — invalid arXiv ID, failed narration | ⬜ Not covered |

---

## What Changed and Why

### 1. Fix brittle `text=Top Contributors` selector (`01-admin-auth.spec.ts`, `admin/page.tsx`)

**Problem**: Admin auth tests used `text=Top Contributors` to assert the dashboard was visible. Any heading copy change would silently break the test.

**Fix**: Added `data-testid="admin-dashboard"` to the authenticated page wrapper in `admin/page.tsx`. Added `ADMIN_DASHBOARD` selector constant to `fixtures.ts` with a CSS fallback for pre-deploy runs. Updated tests to use the new selector.

### 2. Add `data-testid="newly-added-nav"` to BrowseLayout (`BrowseLayout.tsx`)

Added `data-testid` to both the mobile pill and desktop sidebar "Newly Added" buttons. Added `NEWLY_ADDED_NAV` constant to `fixtures.ts`.

### 3. Add cross-route "Newly Added" navigation test (`04-homepage.spec.ts`)

**Problem**: Commit `45a57c5` fixed a bug where clicking "Newly Added" from a non-home route (like `/l?id=...`) failed to navigate back to `/` because `window.history.pushState` doesn't trigger Next.js routing. The fix used `router.push("/")`. This had zero E2E coverage — a regression would be silent.

**Fix**: Added test that navigates to a collection page (`/l?id=...`), clicks "Newly Added", and asserts the pathname becomes `/` and paper cards are visible. Also added a simpler visibility check that "Newly Added" button is present on the homepage.

**Technical note**: BrowseLayout renders two "Newly Added" buttons (mobile pill hidden on desktop, desktop sidebar button visible on desktop). Used Playwright's `:visible` CSS extension to target only the visible button, and `pathname` assertion instead of `toHaveURL` regex to avoid full-URL anchor issues.

### 4. Batch audio playback assertions (`05-audio-playback.spec.ts`)

**Problem**: Two separate tests each called `startAudioPlayback()` (page navigation + audio start) to test different aspects of the same action.

**Fix**: Merged into one test that evaluates both `paused` state and `src` in a single `page.evaluate()` call after one `startAudioPlayback()`.

---

## Performance

Fast suite: 44 passed, 7.7s total. Audio test saves ~1 page load per CI run.

---

## Deploy Status

- Merged to `main` and pushed: ✅
- Frontend deployed to Cloudflare Pages: ✅ (`https://23db5885.unarxiv-frontend.pages.dev`)

---

## Items Needing Human Decision

- **Premium narration modal**: No E2E coverage. Complex multi-step UX (tier selection, API key input, processing state). Worth adding once the premium flow stabilizes.
- **Admin bulk actions**: New Upgraded filter and premium tier bulk actions are untested at E2E level. These require ADMIN_PASSWORD and real API keys — manual testing currently sufficient.
- **Error states**: No test for navigating to a nonexistent paper ID or failed narration display. Low priority — no recent regressions.
