# UI Review — 2026-03-18

## Summary

Audit found 3 actionable consistency issues. All were fixed, built, merged to main, and deployed.

---

## Issues Found & Fixed

### 1. Double `transition-*` class on star rating buttons (bug)

**File:** `src/app/p/PaperPageContent.tsx`

`StarRatingInput` buttons had both `transition-colors` and `transition-transform` as separate Tailwind classes:

```jsx
// Before — transition-transform overwrites transition-colors; color change has no animation
className={`transition-colors ${…} hover:scale-110 transition-transform`}

// After — single transition-all covers both
className={`transition-all ${…} hover:scale-110`}
```

In Tailwind, applying two `transition-*` utilities to the same element causes the second to override the first. The color transition was silently lost.

---

### 2. Dropdown menu border radius and border color (inconsistency)

**File:** `src/app/l/page.tsx`

The share menu and edit-collection menu dropdowns used `rounded-lg border-stone-200`, while `PaperActionsMenu` (the standard dropdown elsewhere in the app) uses `rounded-xl border-stone-300`. Both are semantically the same UI pattern.

```jsx
// Before
<div className="… rounded-lg border-stone-200 …">

// After
<div className="… rounded-xl border-stone-300 …">
```

Two occurrences fixed (share menu + edit menu).

---

### 3. PlayerBar speed button background (inconsistency)

**File:** `src/components/PlayerBar.tsx`

The desktop speed button used `bg-stone-100 hover:bg-stone-200` — identical to the player bar's own background, making it invisible at rest. The mobile speed button already used the correct `bg-stone-200 hover:bg-stone-300`. Unified to `bg-stone-200 hover:bg-stone-300` on both breakpoints.

---

## Shared Components / Design Tokens

No new shared components were introduced. The existing component structure is appropriate for the current scale — patterns repeated across the codebase (buttons, cards, dropdowns) are already self-consistent except for the issues above.

---

## Remaining Issues (Human Input Needed)

- **`about/page.tsx` uses `rounded-2xl border-stone-200`** for its cards, while the rest of the app uses `rounded-xl border-stone-300`. This is subtle and may be intentional (softer look for a static content page). No change made — worth a deliberate decision.

- **`/_global-error` build failure in `interesting-heisenberg` worktree**: Unrelated pre-existing issue (`Invariant: Expected workUnitAsyncStorage to have a store`). Does not affect the main codebase build. Deployed from `crazy-volhard` worktree where build succeeds cleanly.

---

## Deploy Status

- Build: ✅ Passed (`npm run build` in `crazy-volhard` worktree)
- Merge: ✅ `design/ui-review-2026-03-18` → `main`
- Push: ✅ `origin/main` updated
- Deploy: ✅ `texreader-frontend` Cloudflare Pages — production deployment complete
