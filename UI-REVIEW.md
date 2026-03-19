# UI Review — 2026-03-19

## Visual Consistency Issues Found and Fixed

### 1. PaperListRow active state used non-stone color (`bg-blue-100`)
- **File**: `src/components/PaperListRow.tsx`
- **Issue**: The row highlight for the currently-playing paper used `bg-blue-100`, which is outside the stone-only color palette used everywhere else in the app.
- **Fix**: Changed to `bg-stone-200`, consistent with the hover state (`bg-stone-100`) and one step above it for clear active indication.

### 2. BrowseLayout collection loading showed plain text instead of skeleton cards
- **File**: `src/components/BrowseLayout.tsx`
- **Issue**: When a collection's papers were loading, the content area displayed a centered `"Loading..."` text string — the only place in the entire app that did this. All other loading states use `PaperCardSkeleton` components.
- **Fix**: Replaced the text with 3 `PaperCardSkeleton` cards matching every other loading state in the app.

### 3. PaperCardSkeleton border lighter than real PaperCard border
- **File**: `src/components/Skeleton.tsx`
- **Issue**: `PaperCardSkeleton` used `border-stone-200` while the real `PaperCard` uses `border-stone-300`. This caused a visible border weight jump when the skeleton resolved to the real card.
- **Fix**: Changed `PaperCardSkeleton` border to `border-stone-300` to match exactly.

### 4. SearchBar focus ring inconsistent with all other form inputs
- **File**: `src/components/SearchBar.tsx`
- **Issue**: The main search input used `focus:ring-stone-500` while every other input across the codebase (`CreateCollectionModal`, `PaperPageContent` rating textarea, admin search) used `focus:ring-stone-400`.
- **Fix**: Standardized to `focus:ring-stone-400`.

## Skeleton Audit Results

All skeleton components were reviewed against their corresponding rendered layouts:

| Skeleton | Matches Layout | Notes |
|---|---|---|
| `PaperCardSkeleton` | Yes (after fix) | Border corrected from stone-200 to stone-300 |
| `PaperListRowSkeleton` | Yes | Matches DraggablePaperList rows accurately |
| `CollectionSidebarSkeleton` | Yes | Matches sidebar items in BrowseLayout |
| `PaperDetailSkeleton` | Yes | Matches PaperPageContent layout accurately |
| `ScriptPageSkeleton` | Yes | Matches ScriptPageContent layout |
| `MyPapersSectionSkeleton` | Yes | Matches my-papers section rows |
| `CollectionPageSkeleton` | Yes | Matches collection page header + card grid |
| `HomePageSkeleton` (Suspense fallback) | Yes | Correctly represents full-page pre-hydration state |

Note: `HomePageSkeleton` (for Suspense fallback) and the inline `loading` state inside `HomePageContent` serve different purposes and are intentionally separate — the Suspense fallback represents the full page before any client JS runs, while the inline state covers post-hydration data loading with the real header already rendered.

## New Shared Components Created

None. The existing shared component structure is adequate. No pattern appears 3+ times with near-identical markup that is not already shared.

## Design Tokens Observed and Confirmed Consistent

- Stone palette only (no zinc, neutral, gray) — emerald used only for success/CTA accents
- Focus rings: `focus:ring-stone-400` (standardized in this review)
- Card borders: `border-stone-300` (aligned in this review)
- Active row highlight: `bg-stone-200` (fixed from `bg-blue-100`)
- Hover row highlight: `bg-stone-100`
- Card shadow: `shadow-sm`, hover: `shadow-lg`
- Border radius for cards: `rounded-xl`
- Border radius for modals: `rounded-2xl`
- Border radius for pill/tag buttons: `rounded-full`
- Custom text sizes: `text-2xs` (11px) and `text-3xs` (10px) via `@theme`

## Accessibility

No new issues found. Existing coverage:
- All icon-only buttons have `title` attributes
- `role="switch"` and `aria-checked` on toggle in `CreateCollectionModal`
- `aria-label` on Paginator prev/next buttons
- `lang="en"` on `<html>` element
- Modal backdrops dismiss on click via `useClickOutside`

## Remaining Issues Needing Human Input

1. **CLAUDE.md deploy name is stale**: The `CLAUDE.md` says deploy with `--project-name=texreader-frontend` but the actual Cloudflare Pages project is now named `unarxiv-frontend`. CLAUDE.md should be updated.

2. **`my-papers/page.tsx` and `l/page.tsx` use `alert()` for error messages**: Both files use `window.alert()` for list create/delete errors. This is inconsistent with the inline error pattern used elsewhere, but changing it requires a toast/notification system.

3. **`PaperPageContent.tsx` uses `confirm()` for read-status warning**: The "add to playlist when already listened" flow uses a browser `confirm()` dialog. CLAUDE.md states no confirm dialogs on individual actions, but this may be intentional given the destructive read-status consequence.

4. **`about/page.tsx` uses `rounded-2xl border-stone-200`** for its cards vs the standard `rounded-xl border-stone-300` — may be intentional for a softer look on a static content page.

## Deploy Status

- Branch: `design/ui-review-2026-03-19`
- Merged to: `main`
- Pushed to: `origin/main`
- Build: passed (`next build` clean)
- Deployed to: Cloudflare Pages (`unarxiv-frontend`) — https://cef8e630.unarxiv-frontend.pages.dev
