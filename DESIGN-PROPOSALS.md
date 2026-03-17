# Design Proposals — 2026-03-17

Two visual redesigns of unarXiv. Neither is merged to main. Preview both, pick one (or neither).

---

## Proposal A: Midnight Scholar

**Branch:** `design/proposal-a-2026-03-17`
**PR:** https://github.com/seanahrens/unarxiv/pull/5
**Preview:** https://design-proposal-a-2026-03-17.texreader-frontend.pages.dev

### Concept

Dark mode default. The aesthetic of a researcher deep in literature review at 2am — everything stripped away except the work itself.

| Element | Value |
|---|---|
| Background | `slate-950` (near-black) |
| Cards | `slate-900` with `slate-700` border, `indigo-500/50` hover glow |
| Primary text | `slate-100` |
| Secondary text | `slate-400` / `slate-500` |
| Author names | `indigo-400/80` |
| Accent / links | `indigo-400` / `indigo-500` |
| Primary actions | `bg-indigo-600` hover `indigo-500` |
| Player bar | `bg-slate-900`, indigo play buttons + EQ bars |
| Section headers | `text-indigo-400 uppercase tracking-wider` |
| Focus rings | `ring-indigo-500` |

**Typography:** Unchanged Quicksand + IBM Plex Mono. Section labels in `indigo-400` instead of muted stone — better contrast on dark backgrounds.

**Spatial philosophy:** Same density and layout as current site. Color/mood transformation only.

**Key differentiator:** Complete dark mode. Every surface, card, modal, dropdown, player bar converted. Indigo replaces emerald as the primary action hue. Feels like a premium technical product rather than a utility tool.

---

## Proposal B: Paper Trail

**Branch:** `design/proposal-b-2026-03-17`
**PR:** https://github.com/seanahrens/unarxiv/pull/6
**Preview:** https://design-proposal-b-2026-03-17.texreader-frontend.pages.dev

### Concept

The tactile warmth of printed academic literature — like flipping through a well-designed journal or a treasured monograph. Trustworthy, approachable, content-first.

| Element | Value |
|---|---|
| Background | `amber-50` (warm cream) |
| Cards | `white` with `amber-200` border, `amber-400` hover |
| Primary text | `stone-900` (warm near-black, unchanged) |
| Secondary text | `stone-500` / `stone-600` |
| Author names | `amber-800` (terra cotta differentiation) |
| Accent / links | `amber-700` / `amber-800` |
| Primary actions | `bg-stone-800` hover `amber-900` |
| Player bar | `bg-amber-50`, amber-200 scrubber track |
| Section headers | `text-amber-800` with decorative bottom border rule |
| Focus rings | `ring-amber-500` |

**Typography:** **Playfair Display** serif added for paper titles and informational headings. Body stays in Quicksand. The serif creates immediate editorial contrast — signals "this content is worth reading."

**Spatial philosophy:** Same density as current. Editorial warmth comes from color and typography only. Section headers gain decorative `border-b border-amber-200` rules for a magazine-like feel. Footer gets a tinted `amber-100/50` band.

**Key differentiator:** Warm, paper-like feel. Serif typography grounds the academic content. Amber accents are warm and distinctive — feels like a reading artifact, not a tech product.

---

## Comparison

| | Proposal A: Midnight Scholar | Proposal B: Paper Trail |
|---|---|---|
| Mode | Dark | Light |
| Palette | Cool slate + indigo | Warm cream + amber |
| Typography | Sans-serif only | Serif (Playfair) for titles |
| Feel | Premium / technical / focused | Editorial / warm / approachable |
| Layout | Unchanged | Unchanged |
| Best for | Power users, extended night reading | First-time visitors, daytime browsing |

**If you want a premium, technical look with excellent night readability → go with A.**

**If you want warmth, approachability, and an editorial identity that honors the academic content → go with B.**

---

## Compromises

- **Both proposals** preserve layout density and all functionality unchanged. This was intentional — content hierarchy should be validated separately from visual identity.
- **Proposal A**: The admin pages (`/admin`, `/admin/curate`) are fully converted but not deeply polished — functional dark mode, not designed.
- **Proposal B**: The serif font (Playfair Display) adds one Google Font request. A future iteration could use a system serif stack (`Georgia, Times New Roman, serif`) to eliminate the load.
- **Neither proposal** introduces responsive layout changes — a future proposal could explore a more spacious, magazine-like grid for the homepage on large viewports.
