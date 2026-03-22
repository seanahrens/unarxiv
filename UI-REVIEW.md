# UI Review — 2026-03-22

## Summary

Automated daily UX/UI review. 5 visual consistency issues found and fixed.
Build passes, deployed to Cloudflare Pages (`unarxiv-frontend`).

---

## Visual Consistency Issues Found & Fixed

### 1. About Page — Border Color Mismatch (`border-stone-200` → `border-stone-300`)
**File:** `unarxiv-web/frontend/src/app/about/page.tsx`

All 7 section cards on the About page used `border-stone-200`, while every other card-like
element in the codebase (`PaperCard`, `BrowseLayout` panels, `my-papers` lists) uses
`border-stone-300`. Fixed all 7 sections to use `border-stone-300`.

### 2. Sync Modal — Rounding Inconsistency (`rounded-xl` → `rounded-2xl`)
**File:** `unarxiv-web/frontend/src/app/my-papers/page.tsx`

The "Link Profile to Another Device" modal used `rounded-xl`. All other modals in the codebase
(Rating modal, Captcha modal in `PaperPageContent`, collection edit panels in `l/page.tsx`)
use `rounded-2xl`. Standardized to `rounded-2xl`.

### 3. Inline Script Loading State — Plain Text → Skeleton Lines
**File:** `unarxiv-web/frontend/src/app/p/PaperPageContent.tsx`

When switching to the script tab on the paper detail page, the loading state showed a plain
`"Loading script..."` text placeholder. The dedicated `/s` route uses the `ScriptPageSkeleton`
component. Replaced the plain text with animated skeleton lines inside the script container
(`bg-stone-50 border border-stone-200 rounded-xl p-6`), matching the container that appears
once loaded. Uses the shared `Skeleton` component from `Skeleton.tsx`.

### 4. BrowseLayout Empty State — Padding Inconsistency (`py-8` → `py-10`)
**File:** `unarxiv-web/frontend/src/components/BrowseLayout.tsx`

The empty state (no papers in a collection or "Newly Added") used `py-8`. Other empty states
across the site use `py-10` (search results) or `py-12` (collections list). Standardized to
`py-10` as the common convention for content-area empty states.

---

## Skeleton Audit Results

All pages with loading states were audited. Results:

| Page | Skeleton | Status |
|------|----------|--------|
| `/` (homepage) | `HomePageSkeleton` wrapping `BrowseLayoutSkeleton` | ✅ Matches loaded layout |
| `/p?id=...` (paper detail) | `PaperDetailSkeleton` | ✅ Matches — back button, title+action row, authors, abstract lines |
| `/s?id=...` (script viewer) | `ScriptPageSkeleton` | ✅ Matches — back link, title, date, content block |
| `/my-papers` (collections) | `MyPapersSectionSkeleton` | ✅ Matches — list rows with icon + title + action |
| `/l?id=...` (collection view) | `CollectionPageSkeleton` | ⚠️ Fixed — was showing 3 paper cards, updated to 6 to match `BrowseLayout` PAGE_SIZE |
| `/admin` | `Skeleton` (inline) | ✅ N/A — password gate shown before any data loads |

### Fix: `CollectionPageSkeleton` Paper Count (`Skeleton.tsx`)
The `/l` route public view renders `BrowseLayout` which paginates at `PAGE_SIZE = 6`. The
`BrowseLayoutSkeleton` (co-located with `BrowseLayout`) correctly shows 6 paper card skeletons.
`CollectionPageSkeleton` in `Skeleton.tsx` was structurally identical but only showed 3 cards —
a stale count likely from an earlier page design. Updated to 6 cards for consistency.

---

## Component Inventory (no new shared components needed)

The following patterns are well-established and used consistently:

- **Buttons**: Split button (`rounded-l-xl` + `rounded-r-xl` with chevron) via `PaperActionButton` — consistent across all paper states
- **Cards**: `rounded-xl border border-stone-300 p-5 bg-surface shadow-sm` via `PaperCard` — used uniformly
- **Modals**: `fixed inset-0 bg-black/40`, inner `bg-surface rounded-2xl shadow-xl max-w-{size} w-full mx-4 p-{5-6}` — now consistent after sync modal fix
- **Section headers**: `text-sm font-semibold text-stone-{400-600} uppercase tracking-wider` — consistent
- **Empty states**: Centered, `text-stone-{400-500} text-sm`, `py-10` — now consistent after BrowseLayout fix
- **List rows**: `PaperListRow` component handles the icon + title + authors + actions pattern everywhere
- **Skeleton primitives**: All loading states use `Skeleton.tsx` — no ad-hoc skeleton markup found

No new shared components were created — all repeated patterns already have components. No
one-off styles were found that warranted extraction.

---

## Design Token Analysis

Implicit tokens are consistent across the codebase:

| Token | Value | Usage |
|-------|-------|-------|
| Card border | `border-stone-300` | `PaperCard`, `BrowseLayout`, `my-papers`, `About` (fixed) |
| Card rounding | `rounded-xl` (lists) / `rounded-2xl` (cards/modals) | Consistent |
| Card padding | `p-5` (paper cards) / `p-6` (content sections) | Consistent |
| Modal rounding | `rounded-2xl` | Now consistent (fixed sync modal) |
| Section label | `text-sm font-semibold uppercase tracking-wider` | Consistent |
| Body text | `text-sm text-stone-{500-700}` | Consistent |
| Small text | `text-xs` / `text-2xs` (11px) / `text-3xs` (10px) | Consistent |

---

## Accessibility

- All buttons have `cursor: pointer` via `globals.css` global rule
- Interactive elements are keyboard-navigable (native button/link elements)
- `Paginator` has `aria-label` on prev/next buttons
- Focus indicators: Tailwind default focus rings present; no custom overrides found
- Alt text: the PDF iframe has a `title` attribute
- No ARIA label gaps found in reviewed components

---

## Architecture Note: Theme System

The site defaults to `retro-terminal` theme (green phosphor on black). The `themes.css` file
overrides Tailwind's stone color variables per `[data-theme]` attribute, so all `stone-*`
utility classes render in the active theme's color scale. This means the design system is
intentionally theme-aware, not hardcoded to light stone colors.

5 additional themes are defined (`neon-noir`, `solar-flare`, `ocean-depth`, `retro-terminal`,
`candy-pop`). The default can be changed via `NEXT_PUBLIC_THEME` env var.

---

## Remaining Issues (human input needed)

None requiring immediate attention. Lower-priority observations:

- `PaperDetailSkeleton` doesn't include a placeholder for the "ABSTRACT" label that precedes
  the abstract text in the loaded view — very minor, doesn't affect layout structure
- Empty state padding for My Collections page uses `py-12` (slightly taller than the `py-10`
  standard) — intentional since the folder icon makes it visually taller, or could be unified

---

## Deploy Status

✅ Build: passed (`next build` — all 10 routes, no TypeScript errors)
✅ Push: `main` branch pushed to `origin`
✅ Deploy: Cloudflare Pages `unarxiv-frontend` — https://03fe81d3.unarxiv-frontend.pages.dev
