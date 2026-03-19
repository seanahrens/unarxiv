# E2E Test Review — 2026-03-19

**Reviewed:** `unarxiv-web/e2e/` (14 spec files, 49 tests)
**Branch:** `test/e2e-review-2026-03-19`
**Test run:** 40 passed, 9 skipped (all expected fixmes/admin-gated)

---

## Coverage Map

| Critical Path | Covered | Notes |
|---|---|---|
| Paper discovery — homepage, search | ✅ | 04, 06 |
| ArXiv URL format imports | ✅ | 02 |
| Paper import via search bar | ✅ | 03 |
| Audio playback (play, src) | ✅ | 05 |
| Media player controls (speed) | ✅ | 07 (pause/skip fixme — audio unreliable in headless) |
| Downloads (PDF, MP3) | ✅ | 08 |
| Ratings full lifecycle | ✅ | 09 |
| Playlist — dropdown option | ✅ | 10 (new active test added) |
| Playlist — PlayerBar popup | ⚠️ fixme | Audio-dependent; marked fixme with explanation |
| Collections/Lists (API + frontend) | ✅ | 13 |
| Admin auth | ✅ | 01 |
| Admin curate / bulk actions | ❌ | Not covered |
| Transcript viewer | ✅ | 14 |
| Narration generation | ✅ | 11 (slow, narration project only) |
| Error states (invalid ID, failed) | ❌ | Not covered |

---

## What Changed

### 1. `rate-narration-star-*` testid rename (frontend + test)
**File:** `unarxiv-web/frontend/src/app/p/PaperPageContent.tsx`
**File:** `unarxiv-web/e2e/tests/09-ratings.spec.ts`

`data-testid="star-4"` violated the intent-based naming convention — a star
widget appearing elsewhere on the page could collide. Renamed to
`rate-narration-star-{n}` which includes the modal context. Test updated with
legacy fallback selector `[data-testid="rate-narration-star-4"], [data-testid="star-4"]`
so it passes on production before this deploy propagates.

### 2. `PAPER_CARD` fallback selector fix
**File:** `unarxiv-web/e2e/helpers/fixtures.ts`

The legacy fallback `a[href*="/p/"][href*="id="]` never matched actual paper
URLs because the route is `/p?id=` (no slash between `/p` and `?`). Fixed to
`a[href*="/p?id="]`. This is used in homepage and text-search tests.

### 3. Playlist tests rewritten for current PlayerBar UI
**File:** `unarxiv-web/e2e/tests/10-playlist.spec.ts`
**File:** `unarxiv-web/frontend/src/components/PaperActionsMenu.tsx`

Both old playlist tests were `.fixme()` because the playlist moved from
`/my-papers` to the PlayerBar sidebar. The old tests tried to navigate to
`/my-papers` and find paper links there — but the page no longer shows
playlist items. Replaced with:
- **1 active test**: "Add to Playlist option appears in paper actions dropdown"
  — verifies the dropdown item exists, no audio needed, always runs in CI.
- **2 fixme tests**: Full playlist flow (localStorage update, PlayerBar popup)
  — properly documented as audio-dependent and headless-unreliable.

Added `data-testid="add-to-playlist"` to `PaperActionsMenu.tsx` with a
legacy text-content fallback in the test selector.

---

## Performance

No change to test runtime. Fast suite: 40 tests in ~8s (was same before).

---

## Deploy Status

- **Push:** ✅ `main` pushed to `origin`
- **Frontend deploy:** ✅ `unarxiv-frontend` deployed to Cloudflare Pages
  (`https://0a36ed9f.unarxiv-frontend.pages.dev`)
- **Worker deploy:** Not required (no worker changes)

---

## Items Needing Human Decision

1. **Admin curate/bulk actions** — no E2E coverage. Adding tests here would
   require a stable test paper and careful cleanup to avoid deleting real data.
   Suggest adding if/when admin flows become a maintenance pain point.

2. **Error state coverage** — invalid arXiv IDs, failed narration states,
   and network error handling are not tested. These are lower-risk paths for
   a read-heavy site but worth adding before the admin curate UI is modified.

3. **`10-playlist.spec.ts` fixme tests** — the two fixme playlist tests
   (localStorage update, PlayerBar popup) are correct in structure but will
   remain fixme until audio streaming in headless CI is resolved. No action
   needed unless the playlist feature becomes a frequent regression source.

4. **Scheduled task skill uses wrong deploy project name** — the skill
   template references `texreader-frontend` (old name) in Step 5. Updated
   deploy above used `unarxiv-frontend` (correct per CLAUDE.md). The skill
   template should be updated to avoid confusion on future runs.
