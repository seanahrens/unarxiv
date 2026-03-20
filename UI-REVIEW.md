# UI Review — 2026-03-20

## Summary

Automated daily UX/UI review. Audited all pages visually (via dev server with retro-terminal theme, connecting to production API) and reviewed all component source files. One file changed: `src/components/Skeleton.tsx`.

---

## Visual Consistency Audit

**Spacing / Typography / Colors:** Consistent throughout. Stone palette applied uniformly. The active theme in development (and production) is `retro-terminal` — all stone color tokens are remapped to green phosphor values in `themes.css`. No hardcoded hex values in component files; all colors go through Tailwind tokens.

**One exception found (low priority, not changed):** `globals.css` progress-flow animation uses raw `rgb(59 130 246)` / `rgb(99 102 241)` values (blue/indigo) for the narration progress bar. This is intentional — the "processing" bar intentionally differs from the stone palette to signal activity. Left as-is.

**Interactive elements:** Hover/focus states present on all interactive elements. Back buttons, pills, and menu items all have `transition-colors` and appropriate hover states.

**Cards and containers:** Consistent `rounded-xl border border-stone-300 p-5 bg-surface` on PaperCard. Collection list rows use `border border-stone-300 rounded-xl overflow-hidden divide-y divide-stone-200`.

**Icons:** Entirely custom inline SVGs — Lucide React is not actually used in the codebase despite being listed as available. This is a consistent (if verbose) pattern; not changed per the "progressive" principle.

**Responsive behavior:** Two-column desktop / pill mobile layout in BrowseLayout is consistent with other pages.

---

## Skeleton Audit

### Pages and Their Skeletons

| Page | Skeleton | Status Before | Status After |
|------|----------|---------------|--------------|
| `/` (homepage) | `HomePageSkeleton` (inline) + `BrowseLayoutSkeleton` | Accurate | Accurate |
| `/p?id=...` (paper detail) | `PaperDetailSkeleton` | Missing action button | Fixed |
| `/s?id=...` (script viewer) | `ScriptPageSkeleton` | Accurate | Accurate |
| `/my-papers` (collections) | `MyPapersSectionSkeleton` | Missing border wrapper | Fixed |
| `/l?id=...` (collection view) | `CollectionPageSkeleton` | Stale — wrong structure | Fixed |
| `/about` | No skeleton (not needed) | n/a | n/a |
| `/admin` | No skeleton | n/a | n/a |

### Skeletons Fixed

#### 1. `PaperDetailSkeleton` (`/p` page)

**Problem:** The actual paper detail page renders title and `PaperActionButton` side-by-side on desktop (`flex flex-col md:flex-row md:items-start gap-3`). The skeleton only showed stacked title lines — no action button placeholder on the right side.

**Fix:** Wrapped title lines in `flex-1 min-w-0` and added a `shrink-0 rounded-xl w-[100px] h-[36px]` skeleton block to the right, matching the Narrate/Play button's approximate size.

#### 2. `MyPapersSectionSkeleton` (`/my-papers` page)

**Problem:** The actual loaded collections list wraps rows in `border border-stone-300 rounded-xl overflow-hidden`. The skeleton used bare `divide-y divide-stone-200` with no outer border/radius, causing a visible layout jump when content loaded.

**Fix:** Added `border border-stone-300 rounded-xl overflow-hidden` to the skeleton wrapper.

#### 3. `CollectionPageSkeleton` (`/l` page)

**Problem:** The public collection list view renders: `HeaderSearchBar → h-6 gap → BrowseLayout` (which itself has a two-column desktop layout with sidebar and paper grid, plus horizontal pills on mobile). The skeleton was a simple `space-y-4` with a title, description, and 3 plain paper cards — structurally wrong on every dimension: missing the search bar, missing the sidebar, missing the pill row.

**Fix:** Replaced with a skeleton that mirrors the full public view structure:
- Search bar placeholder (`max-w-2xl mx-auto ... h-12 rounded-xl`)
- `h-6` spacer
- Mobile: 3 pill skeletons in a flex row
- Desktop: two-column layout with `w-56` sidebar (label + 5 nav item rows) and `flex-1` papers grid (section label + 3 `PaperCardSkeleton`)

---

## Component Inventory

**Patterns with 3+ usages that could be shared components:**

| Pattern | Usages | Recommendation |
|---------|--------|----------------|
| Back button (`rounded-full px-3 py-1 border border-stone-300`) | 3+ pages | Could be a shared component, but each has custom nav logic — leave inline |
| Inline folder/globe/edit SVG icons | 6+ files | Consider Lucide React — large scope, skip for now |
| Input focus ring (`focus:outline-none focus:ring-2 focus:ring-stone-300/400`) | 5+ inputs | Minor drift in ring color — see Remaining Issues |

---

## Design Tokens

Implicit tokens in use:

| Token | Values | Consistency |
|-------|--------|-------------|
| Border radius — cards | `rounded-xl` | Consistent |
| Border radius — buttons | `rounded-lg`, `rounded-full`, `rounded-xl` | Intentional by context |
| Card border | `border border-stone-300` | Consistent |
| Section divider | `divide-y divide-stone-200` | Consistent |
| Transition | `transition-colors` | Consistent on interactive elements |
| Muted text | `text-stone-400` (decorative), `text-stone-500` (secondary) | Consistent |
| Surface bg | `bg-surface` (CSS var) | Consistent |

---

## Remaining Issues (needs human input)

1. **Input style drift** — three distinct input border styles exist:
   - Rating modal textarea: `border border-stone-300 focus:ring-stone-400`
   - Collection import textarea: `border-2 border-stone-400 focus:ring-stone-300 bg-stone-100`
   - Edit mode fields: borderless (`bg-transparent outline-none`)
   The `border-2` in the import textarea is visually heavier. Worth unifying if a design decision is made.

2. **Inline SVGs vs Lucide** — the codebase doesn't use Lucide React despite it being available. Switching would require replacing ~40+ custom SVGs. Recommend making this a deliberate choice.

3. **`BrowseLayoutSkeleton` duplication** — `BrowseLayoutSkeleton` lives in `BrowseLayout.tsx` (co-located). `CollectionPageSkeleton` now mirrors its structure to avoid a circular dependency. A future refactor could move `BrowseLayoutSkeleton` into `Skeleton.tsx` and have `BrowseLayout.tsx` import it from there.

---

## Changes Made

**File:** `unarxiv-web/frontend/src/components/Skeleton.tsx`
**Commit:** `d9c6915` — "fix: update stale skeleton layouts to match current rendered pages"
**Branch:** `design/ui-review-2026-03-20` → merged to `main`

---

## Deploy Status

- Build: ✅ Passed (`npm run build`, all 10 routes, no TypeScript errors)
- Push: ✅ `git push origin main`
- Deploy: ✅ Cloudflare Pages (`unarxiv-frontend`) — deployment complete
