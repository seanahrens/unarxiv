# E2E Review — 2026-03-25

## Summary

One targeted fix and one documentation update. No new tests were required — coverage was already complete. All 45 tests pass (8 skipped: 4 `fixme` headless-CI unreliable, 1 Turnstile feature disabled, 1 requires ADMIN_PASSWORD, 2 conditional skips). Build succeeded. Merged to `main` and deployed.

---

## Coverage Map

| Critical Path                          | Status |
|----------------------------------------|--------|
| Homepage paper cards                   | ✅ Covered (04) |
| Paper card → paper page navigation     | ✅ Covered (04) |
| ArXiv URL formats (/abs, /html, /pdf)  | ✅ Covered (02) |
| Invalid paper ID error state           | ✅ Covered (02) |
| ArXiv ID search → auto-import          | ✅ Covered (03) |
| Full-text search (results / no results)| ✅ Covered (06) |
| Audio playback (play, src correct)     | ✅ Covered (05) |
| PlayerBar (appears, speed cycling)     | ✅ Covered (07) |
| Pause/resume, skip, player link        | ⚠️ fixme — headless CI unreliable |
| Download PDF + audio (API + dropdown)  | ✅ Covered (08) |
| Ratings (full lifecycle)               | ✅ Covered (09) |
| Playlist (add / remove / persist)      | ✅ Covered (10) |
| Narration generation (full lifecycle)  | ✅ Covered (11, slow suite) |
| Collections / Lists (full CRUD + UI)   | ✅ Covered (13) |
| Transcript viewer                      | ✅ Covered (14) |
| Admin auth (UI + API)                  | ✅ Covered (01) |
| "Newly Added" navigation               | ✅ Covered (04) |
| Turnstile                              | ⏭️ Skipped — feature disabled |
| Admin curate bulk actions (UI)         | ❌ Not covered (see below) |
| Failed narration display               | ❌ Not covered (see below) |

---

## What Changed

### 1. `data-testid="paper-error"` on error state (frontend)
**File:** `unarxiv-web/frontend/src/app/p/PaperPageContent.tsx`
**Why:** The `<p className="text-red-600">` element shown when a paper is not found had no stable selector. The test at `02-arxiv-routes.spec.ts` was using the raw `.text-red-600` CSS class — brittle and would break silently on any Tailwind color refactor.
**Change:** Added `data-testid="paper-error"` to the error paragraph.

### 2. `PAPER_ERROR` fixture constant + test update (e2e)
**Files:** `unarxiv-web/e2e/helpers/fixtures.ts`, `unarxiv-web/e2e/tests/02-arxiv-routes.spec.ts`
**Why:** Follows the established fallback pattern: prefer `data-testid`, fall back to CSS class for pre-deploy runs. Centralizes the selector so future renames touch one place.
**Change:** Added `PAPER_ERROR = '[data-testid="paper-error"], .text-red-600'` to fixtures; updated test to use it.

### 3. TEST_SPEC.md accuracy
**File:** `unarxiv-web/e2e/TEST_SPEC.md`
**Why:** Three tests existed in the test files but were absent from the spec document:
- `invalid paper ID shows error state` (section 02)
- `Newly Added navigation button is visible on homepage` (section 04)
- `clicking Newly Added from a collection page navigates back to /` (section 04)

---

## Performance

No regressions. Full fast suite: **45 tests in 9.5 seconds** (4 workers, fully parallel).

---

## Deploy Status

- **Branch merged to main:** `test/e2e-review-2026-03-25` → `main` ✅
- **Pushed to origin:** `git push origin main` ✅ (commit `41ae211`)
- **Frontend build:** ✅ `npm run build` succeeded
- **Frontend deploy (manual):** Preview deployed — `https://43a7bc17.unarxiv-frontend.pages.dev`
- **Production deploy:** Triggered via CI workflow from the `main` push → `unarxiv.org`

---

## Items for Human Decision

1. **Admin curate UI tests**: Bulk delete/reprocess actions on `/admin` are not tested. They require `ADMIN_PASSWORD` in CI (already available as secret) but would modify production data during the test run — needs deliberate design for safe teardown before adding.

2. **Failed narration display**: Testing the "Narration failed" error state in the UI requires triggering a real failure in prod, which is fragile. A mock/fixture approach would be safer but is a larger change.

3. **`fixme` media player tests** (pause/resume, skip, paper link): Marked `fixme` because headless Chromium cannot reliably stream audio over the network in CI. Could potentially be re-enabled by mocking the audio endpoint with `page.route()` — worthwhile if these paths become regression-prone.
