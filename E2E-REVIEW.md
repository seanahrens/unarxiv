# E2E Test Review — 2026-03-19

**Reviewed:** `unarxiv-web/e2e/` (14 spec files, 48 tests)
**Branch:** `test/e2e-review-2026-03-19`
**Result:** 41 passed, 7 skipped (5 fixme, 1 turnstile, 1 admin-password), 0 failures

## Issues Found and Fixed

### 1. Playlist Tests Completely Broken (10-playlist.spec.ts)

Both tests were `test.fixme()` with a comment "Playlist UI moved to PlayerBar sidebar." They navigated to `/playlist` (wrong — route is `/my-papers`) and verified paper links in the My Additions server-side list, not the localStorage-based playlist. The tests had been stale since the playlist moved from the my-papers page into the PlayerBar sidebar.

**Fix:** Rewrote both tests to test the actual current UX — adding and removing papers via the actions dropdown on the paper page, and verifying the button state toggles ("Add to Playlist" ↔ "In Playlist"). Both tests now pass.

### 2. Media Player Speed Button Selector Ambiguous

`07-media-player.spec.ts` used `button:has-text("1x")` which could match either the legacy `HeaderPlayer` or the current `PlayerBar`. Test description still said "header player" even though `PlayerBar` is the current component.

**Fix:** Added `data-testid="player-speed"` to the speed button in `PlayerBar.tsx` (both desktop and mobile layouts). Updated selector to `[data-testid="player-speed"], button[title="Speed"]` with fallback. Also added `data-testid="player-play-pause"` to the PlayerBar main play/pause button.

### 3. Narration Generation URL Regex Bug (11-narration-gen.spec.ts)

URL regex was `/p/\?id=TEST_ID` (included a literal `/` before `?`) but actual URL format is `/p?id=...`. The narration test was broken for the URL redirect assertion.

**Fix:** Corrected regex to `/p\??id=TEST_ID`.

### 4. Download and Rating Selectors Had No data-testid

`08-downloads.spec.ts` and `09-ratings.spec.ts` relied on raw text selectors (`text=Download PDF`, `button:has-text("Rate Narration")`). No testids existed in `PaperActionsMenu.tsx`.

**Fix:** Added testids `download-pdf`, `download-audio`, `rate-narration`, `add-to-playlist`, `remove-from-playlist` to `PaperActionsMenu.tsx`. Updated test selectors to testid-with-fallback pattern.

### 5. Play Button Selector Could Be Ambiguous

`startAudioPlayback` in `page-actions.ts` used `button:has-text("Play")` which could match the PlayerBar play button if it was visible on the page simultaneously.

**Fix:** Added `data-testid="play-paper"` to the non-compact play button in `PaperActionButton.tsx`. Updated selector to `[data-testid="play-paper"], button:has-text("Play")`.

## New data-testid Attributes Added

| Component | testid | Purpose |
|---|---|---|
| `PaperActionButton` | `play-paper` | Full-size play button on paper detail page |
| `PaperActionsMenu` | `add-to-playlist` | Add to playlist menu item |
| `PaperActionsMenu` | `remove-from-playlist` | "In Playlist" state button |
| `PaperActionsMenu` | `rate-narration` | Rate Narration menu item |
| `PaperActionsMenu` | `download-audio` | Download Audio menu item |
| `PaperActionsMenu` | `download-pdf` | Download PDF menu item |
| `PlayerBar` | `player-speed` | Speed button (desktop + mobile) |
| `PlayerBar` | `player-play-pause` | Play/pause button in expanded player |

## Deployment

Frontend deployed to: https://claude-recursing-goldstine.unarxiv-frontend.pages.dev

## Items Still Needing Attention

- **Fixme media controls** (pause, skip back/fwd, paper link): These require real audio streaming which is unreliable in headless CI. They are correctly marked fixme. No change recommended without a CI audio solution.
- **Turnstile test**: Correctly skipped at suite level — Turnstile is disabled in production.
- **Admin curate**: Only auth redirect covered, not bulk operations.
- **Error states**: Failed narration, invalid paper ID — still no coverage.

---

# E2E Test Review — 2026-03-18

**Reviewed:** `unarxiv-web/e2e/` (14 spec files, 50 tests)
**Branch:** `test/e2e-review-2026-03-18`

## Issues Found and Fixed

### 1. Duplicated selector constants
`PAPER_CARD` and `SEARCH_INPUT` selector fallback strings were duplicated in
`04-homepage.spec.ts`, `06-text-search.spec.ts`, `03-arxiv-search-import.spec.ts`,
and `11-narration-gen.spec.ts`. Moved to `helpers/fixtures.ts` as exported constants.

### 2. Dead `startAudioPlayback` helper
`helpers/page-actions.ts` exported `startAudioPlayback` but it was never imported.
`05-audio-playback.spec.ts` and `07-media-player.spec.ts` each manually duplicated
the identical navigate+click+waitForFunction startup sequence. Both files now call
`startAudioPlayback`, removing three duplicated blocks.

### 3. Silent `return` in reorder test
`13-lists.spec.ts` "reorder list items" used `if (!secondPaper) return;` which passes
silently with zero assertions. Replaced with `test.skip()` for proper Playwright
reporting.

### 4. `cleanupTestPaper` duplicated the DELETE endpoint URL
`cleanupTestPaper` and `adminDeletePaper` both called the same endpoint separately.
Refactored `cleanupTestPaper` to delegate to `adminDeletePaper`.

## Verification

- `npx playwright test --list` — 50 tests discovered, no compile errors
- `npm run build` in `unarxiv-web/frontend` — clean build, all 9 routes generated

---

# E2E Test Review — 2026-03-17

## Coverage Map

| Critical Path | Status | Test File |
|---|---|---|
| Paper discovery — homepage, search | ✅ Covered | 04, 06 |
| Paper discovery — arXiv URL formats (/abs, /html, /pdf) | ✅ Covered | 02 |
| Paper import via search | ✅ Covered | 03 |
| Paper narration generation | ✅ Covered (slow suite) | 11 |
| Audio playback (play, pause, seek, speed) | ✅ Covered | 05, 07 |
| Global header player | ✅ Covered | 07 |
| Downloads (PDF, MP3) | ✅ Covered | 08 |
| Ratings lifecycle | ✅ Covered | 09 |
| Playlist (add, remove, persist) | ✅ Covered | 10 |
| Collections/Lists (CRUD, auth, reorder) | ✅ Covered | 13 |
| Admin auth (pages + API) | ✅ Covered | 01 |
| Admin curate page functionality | ⚠️ Only auth redirect tested | 01 |
| Transcript viewer (/s) | ✅ Covered (new) | 14 |
| Error states (invalid ID, 404, failed narration) | ❌ Missing | — |
| Listen history on /playlist | ❌ Missing | — |

## Performance

- Test run time: **8.9s** for 46 tests (fast suite)
- No regression from this PR (was ~9–10s before)
- Removed `waitForTimeout(200)` in skip-back test — replaced with `waitForFunction`
- Removed `waitForLoadState("networkidle")` in gibberish search — replaced with `.waitFor({state:"detached"})`

## What Changed and Why

### New Coverage
- `14-transcript.spec.ts`: The `/s?id=` transcript viewer was completely untested. Added UI and API tests.

### Selector Stability
- Added `data-testid` attributes to `PaperCard`, `SearchBar`, `PaperPageContent` (chevron, rating modal, star buttons). These provide stable selector targets for future test maintenance.
- Extracted `helpers/page-actions.ts` with `openDropdown()` to eliminate the duplicated SVG-path chevron selector (`button:has(svg polyline[points="6 9 12 15 18 9"])`) that appeared in 3 test files.
- All new selectors use fallback CSS selector lists (e.g., `[data-testid="paper-card"], a[href*="/p/"]`) so tests continue to pass against production before the next frontend deployment.

### Docs
- `TEST_SPEC.md` updated to include tests 12–14 and fix copy mismatches.

## PR

https://github.com/seanahrens/unarxiv/pull/3

## Items Needing Human Decision

- **Error state coverage**: Testing invalid arXiv IDs, 404 pages, and failed narrations is currently absent. These could be added but would need production test data in a failed state (or mocking, which goes against the production-testing philosophy).
- **Admin curate page**: Bulk delete/reprocess functionality is not E2E tested — only the auth redirect is. Full coverage would require ADMIN_PASSWORD in CI and careful cleanup to avoid deleting real papers.
- **After deployment**: Once this PR is merged and the frontend is deployed, the fallback selectors in `page-actions.ts` and test files can be simplified to use `data-testid` only.
