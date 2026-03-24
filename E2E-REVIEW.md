# E2E Review — 2026-03-24

## Summary

Ran Phase 1 (review) + Phase 2 (execute) on the full E2E test suite.
4 commits merged to main and frontend deployed.

---

## Phase 1: Findings

### 1. Critical Path Coverage

| Path | Status |
|------|--------|
| Paper discovery — homepage, search, arXiv URL formats | ✅ Covered |
| Paper import via search | ✅ Covered |
| Narration generation (slow test) | ✅ Covered (narration project) |
| Audio playback — play, src | ✅ Covered |
| Audio playback — pause/resume/skip | ⚠️ `fixme` (headless-unreliable) |
| Downloads — PDF + audio | ✅ Covered |
| Ratings — full lifecycle | ✅ Covered |
| Playlists — add, remove, persist | ✅ Covered |
| Collections/Lists — API CRUD + frontend | ✅ Covered |
| Admin auth — login, reject bad passwords | ✅ Covered |
| Admin curate bulk actions | ❌ Not covered (human decision needed) |
| Error states — invalid paper ID | ✅ Added this session |
| Error states — failed narration display | ⚠️ Not covered (difficult to trigger reliably in prod) |
| Transcript viewer | ✅ Covered |

### 2. Critical Bug Found

Test `11-narration-gen.spec.ts` used `button:has-text("Generate Audio Narration")` but the actual
button text in the UI is `"Narrate"`. This test would have failed on every run had it been in
the fast project. **Fixed.**

### 3. Brittle Selectors

Rating modal buttons (Submit, Done, Cancel, Clear) used raw `button:has-text(...)` selectors with
no data-testid. Admin Continue button and Link Profile button similarly had no data-testid.
**All fixed with data-testid additions + fallback pattern updates.**

### 4. Code Quality

- All shared selectors are now in `fixtures.ts` (single source of truth).
- The `RATING_MODAL` fallback `div.fixed.inset-0` remains slightly Tailwind-dependent but is
  acceptable since the data-testid is now deployed and will be preferred.
- The SVG path fallback in `openDropdown` (`button:has(svg polyline[points="..."])`) remains;
  since `data-testid="open-paper-actions"` is already deployed, it's a dead fallback but harmless.

### 5. Performance

No regressions. Total fast-suite runtime: ~8s across 45 tests (4 workers). No unnecessary
navigations added.

---

## Phase 2: Changes Made

### Commit 1: `feat(testids): add data-testid attributes to key interactive elements`
- `data-testid="generate-narration"` → Narrate/Retry button (`PaperActionButton.tsx`)
- `data-testid="submit-rating"`, `cancel-rating`, `clear-rating`, `done-rating` → rating modal (`PaperPageContent.tsx`)
- `data-testid="admin-continue"` → admin password submit button (`admin/page.tsx`)
- `data-testid="link-to-another-device"` → device sync button (`my-papers/page.tsx`)

### Commit 2: `fix(e2e): update test selectors to use data-testid fallbacks`
- Added 7 new named selectors to `fixtures.ts`:
  `GENERATE_NARRATION`, `SUBMIT_RATING`, `DONE_RATING`, `CANCEL_RATING`,
  `CLEAR_RATING`, `ADMIN_CONTINUE`, `LINK_TO_ANOTHER_DEVICE`
- Fixed broken `"Generate Audio Narration"` selector in `11-narration-gen.spec.ts`
- Updated `01-admin-auth`, `09-ratings`, `11-narration-gen`, `13-lists` to use shared constants

### Commit 3: `test(e2e): add error state and my-papers playlist coverage`
- `02-arxiv-routes`: new test — "invalid paper ID shows error state" — navigates to
  `/p?id=totally-invalid-id-xyz999` and verifies a `.text-red-600` error element appears.

### Commit 4: `fix(e2e): remove invalid my-papers playlist display test`
- Removed a test looking for playlist paper links on `/my-papers` — that page only shows
  collections (lists), not playlist items. The playlist lives in the PlayerBar queue, not
  a standalone page.

---

## Test Results

```
45 passed, 8 skipped (fixme × 4, ADMIN_PASSWORD not set × 2, Turnstile skipped × 1, reorder skip × 1)
Runtime: ~8s
```

---

## Deploy Status

- **Merged to main**: ✅ fast-forward, pushed to origin
- **Frontend deployed**: ✅ `https://cd057856.unarxiv-frontend.pages.dev`

---

## Items Needing Human Decision

1. **Admin curate / bulk actions**: No E2E coverage for `/admin/curate` (bulk reprocess, bulk delete).
   Would require `ADMIN_PASSWORD` in CI and careful test isolation to avoid side effects on real data.

2. **Failed narration state display**: Testing the "Narration failed" UI requires triggering a
   real narration failure in prod, which is fragile. Consider a mock/fixture approach if this
   becomes a regression area.

3. **Pause/resume/skip marked fixme**: The 4 headless-unreliable media player tests remain as
   `fixme`. These could potentially be enabled by mocking the audio stream, but that requires
   meaningful refactoring of the test setup.

4. **Turnstile test skipped**: `12-turnstile.spec.ts` is entirely skipped since the feature is
   disabled. If/when Turnstile is re-enabled, this test should be re-enabled too.
