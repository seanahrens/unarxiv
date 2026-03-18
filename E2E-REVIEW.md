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
