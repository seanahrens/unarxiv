# UI Review — 2026-03-21

## Visual Consistency Audit

**Colors:** The site runs in the `retro-terminal` theme by default (green phosphor on black). This is
intentional — `ACTIVE_THEME` defaults to `"retro-terminal"` in `src/lib/theme-config.ts`. All color
usage is consistent within the theme via Tailwind CSS variable overrides. No hardcoded hex values
found in component files; all colors reference the stone (retro-remapped) palette as expected.

**Spacing/Typography:** Consistent throughout. Custom size tokens `text-2xs` (11px) and `text-3xs`
(10px) are defined in `globals.css` and used consistently. Standard spacing scale followed across
components.

**Cards:** Two card families exist with intentional differentiation:
- Paper cards: `rounded-xl border p-5 bg-surface border-stone-300` — tighter, content-dense.
- About/section cards: `rounded-2xl border p-6 bg-surface border-stone-200` — slightly softer, more
  breathing room for prose sections.
Both are internally consistent. Not a bug.

**Interactive elements:** All buttons have consistent `transition-colors` hover states. Focus rings
are present on interactive inputs. The `button, [role="button"] { cursor: pointer }` rule in
`globals.css` applies universally.

**Icons:** All icons are inline SVGs or custom components (`AudioFileIcon`, `FileIcon`, `LogoIcon`).
No mixed icon libraries. Sizes are consistent within each context.

**Responsive:** All pages use responsive Tailwind breakpoints consistently (`md:`, `lg:`). The
mobile/desktop layouts (pill nav vs sidebar) in `BrowseLayout` degrade cleanly.

**No issues found in this section.**

---

## Skeleton Audit

### `BrowseLayoutSkeleton` — STALE (fixed)

**Location:** `unarxiv-web/frontend/src/components/BrowseLayout.tsx`

**Issue:** `BrowseLayoutSkeleton` (exported, used on homepage and collection pages as the initial
loading state) showed **4** `PaperCardSkeleton` items in the right column. `BrowseLayout` uses
`PAGE_SIZE = 6`, meaning the loaded state renders up to 6 paper cards. This caused a visible layout
shift — 4 skeleton cards would collapse/jump to 6 real cards when content loaded.

**Fix:** Added 2 more `PaperCardSkeleton` entries. Now shows 6, matching `PAGE_SIZE`.

### Search Results Loading Skeleton — STALE (fixed)

**Location:** `unarxiv-web/frontend/src/app/page.tsx`

**Issue:** The inline search loading skeleton (shown while `loading && searchQuery`) rendered
**3** `PaperCardSkeleton` items, but `SEARCH_PAGE_SIZE = 10`. On a typical search, 3 skeleton cards
would jump to 5–10 real results.

**Fix:** Updated to 5 skeleton cards — a closer approximation that smooths the transition without
over-rendering on fast connections.

### All other skeletons — OK

| Skeleton | Used for | Status |
|----------|----------|--------|
| `PaperDetailSkeleton` | `/p` paper detail page | Matches title/authors/abstract layout ✓ |
| `ScriptPageSkeleton` | `/s` script viewer | Matches back link + title + script block ✓ |
| `MyPapersSectionSkeleton` | `/my-papers` collections list | Matches `PaperListRow` layout ✓ |
| `PaperListRowSkeleton` | PlayerBar playlist, DraggablePaperList | Matches row layout ✓ |
| `CollectionPageSkeleton` | `/l` collection view (initial load) | Matches HeaderSearchBar + BrowseLayout structure ✓ |
| `BrowseLayoutPapersSkeleton` | Collection switching within BrowseLayout | 3 cards for variable-size collections, acceptable ✓ |

---

## Component Inventory

**No new shared components created.** All repeated patterns already have appropriate abstractions:
- `PaperCard`, `PaperListRow`, `PaperActionButton`, `PaperActionsMenu` cover paper interactions.
- `BrowseLayout` encapsulates the two-column browse UI.
- `Skeleton.tsx` provides all shared loading primitives.
- `PlayerBar` is the single audio player.

The "Back" button pattern (pill-shaped, `border border-stone-300 rounded-full px-3 py-1`) appears in
3 places (`PaperPageContent.tsx`, `l/page.tsx` ×2) and is already implemented as a local `BackButton`
component in `PaperPageContent.tsx`. Not extracted globally — it has page-specific navigation logic
in each location, making a shared component harder to justify without behavioral coupling.

---

## Design Tokens Established

No new tokens established — the existing system is sufficient:
- Tailwind v4 CSS variable overrides in `themes.css` handle per-theme tokens.
- `@theme` block in `globals.css` defines the two custom text sizes.
- `--color-surface` is the semantic card/panel color, used consistently.

---

## Accessibility Baseline

- Keyboard navigation: interactive elements are buttons/links with appropriate roles.
- Focus indicators: browser defaults (plus Tailwind ring utilities where applied).
- Alt text: the logo image uses `LogoIcon` which renders an inline SVG without an alt (acceptable
  for decorative icons alongside text).
- ARIA: player controls in `PlayerBar` lack explicit ARIA labels on some icon-only buttons — noted
  as a future improvement, not addressed in this styling-only pass.
- Color contrast: in the retro-terminal theme, the green-on-black palette uses high-contrast values
  (`stone-900` → `#00ff00`, `stone-600` → `#00cc00`). Secondary text is still legible on dark bg.

---

## Remaining Issues for Human Review

1. **PlayerBar icon-only buttons** lack `aria-label` attributes (play, pause, skip, rewind, speed).
   These should be labeled for screen reader users — but this is a behavioral/accessibility concern,
   not a styling refactor.

2. **Scheduled task deploy command is stale:** The `SKILL.md` for this task references
   `texreader-frontend` as the Cloudflare Pages project name. The actual project is
   `unarxiv-frontend`. Update the task's deploy command to avoid the error on future runs.

---

## Deploy Status

- **Build:** ✅ Passed (`next build` — all 10 routes compiled, no TypeScript errors)
- **Deploy:** ✅ Success — https://869e29cc.unarxiv-frontend.pages.dev
- **Project:** `unarxiv-frontend` (Cloudflare Pages)
