# unarXiv Design Proposals — Living Document

All design explorations live here. Branches are never merged to main without explicit approval. Each run of the design skill adds new proposals and must avoid repeating what's listed here.

---

## Summary Table

| Date | Name | Branch | Genre | Screenshot | Status |
|------|------|--------|-------|-----------|--------|
| 2026-03-17 | Midnight Scholar | `design/proposal-a-2026-03-17` | Dark mode / cool technical | [screenshot](screenshots/proposal-a-2026-03-17.png) | Open |
| 2026-03-17 | Paper Trail | `design/proposal-b-2026-03-17` | Warm editorial / print | [screenshot](screenshots/proposal-b-2026-03-17.png) | Open |
| 2026-03-18 | Broadsheet | `design/proposal-a-2026-03-18` | Brutalist newspaper | [screenshot](screenshots/proposal-a-2026-03-18.png) | Open |
| 2026-03-18 | Signal | `design/proposal-b-2026-03-18` | Dark ambient audio app | [screenshot](screenshots/proposal-b-2026-03-18.png) | Open |
| 2026-03-18 | Foxed | `design/proposal-c-2026-03-18` | Textured warm library | [screenshot](screenshots/proposal-c-2026-03-18.png) | Open |
| 2026-03-18 | Prism | `design/proposal-d-2026-03-18` | Glassmorphism / mesh gradient | [screenshot](screenshots/proposal-d-2026-03-18.png) | Open |

---

## Round 1 — 2026-03-17

### Proposal A: Midnight Scholar

**Branch:** `design/proposal-a-2026-03-17`
**PR:** https://github.com/seanahrens/unarxiv/pull/5
**Genre:** Dark mode / cool technical
**Screenshot:** `screenshots/proposal-a-2026-03-17.png`

**Mood:** A researcher deep in literature review at 2am — everything stripped away except the work itself. Premium, focused, indigo-tinged.

**Palette:**
- Background: `slate-950` (near-black)
- Cards: `slate-900` with `slate-700` border, `indigo-500/50` hover glow
- Text: `slate-100` / `slate-400`
- Accent: `indigo-400` / `indigo-600`

**Typography:** Unchanged Quicksand + IBM Plex Mono. Section labels in `indigo-400`.

**Layout:** Same density as current site. Color/mood transformation only.

**Critique:** Feels like a color palette change. Layout is identical to main. No textures, patterns, or structural differentiation.

---

### Proposal B: Paper Trail

**Branch:** `design/proposal-b-2026-03-17`
**PR:** https://github.com/seanahrens/unarxiv/pull/6
**Genre:** Warm editorial / print academic
**Screenshot:** `screenshots/proposal-b-2026-03-17.png`

**Mood:** The tactile warmth of a well-designed journal or treasured monograph. Trustworthy, approachable, content-first.

**Palette:**
- Background: `amber-50` (warm cream)
- Cards: `white` with `amber-200` border
- Text: `stone-900` / `stone-500`
- Accent: `amber-700` / `amber-800`

**Typography:** Playfair Display serif added for paper titles. Serif creates editorial contrast.

**Layout:** Same density as current. Section headers gain decorative border rules.

**Critique:** Warmer and more editorial feeling than A, but still fundamentally the same layout with a color/font swap. No patterns, textures, imagery, or structural redesign.

---

---

## Round 2 — 2026-03-18

### Proposal A: Broadsheet

**Branch:** `design/proposal-a-2026-03-18`
**Genre:** Brutalist newspaper / print editorial
**Screenshot:** `screenshots/proposal-a-2026-03-18.png`
**Dev server port:** 3001

**Mood:** A raw, uncompromising broadsheet. Dense information, bold type, no softening. Like picking up a physical newspaper that happened to be about academic research.

**Palette:**
- Background: `#ffffff` (pure white)
- Cards: `#ffffff` with `#000000` border (2px solid), hard drop shadow `4px 4px 0 #000`
- Text: `#000000` primary, `#444444` secondary
- Accent: `#d32f2f` (newspaper red — section numbers, hover borders)
- Header/footer: `#000000` background, `#ffffff` text

**Typography:** IBM Plex Mono as primary display font throughout. Giant bold all-caps headline. Section prefixes in red monospace ("01 —", "02 —"). No rounded corners anywhere.

**Layout:** 2-column desktop paper grid (`md:grid-cols-2`). Full-width solid black header (no blur). Section headers use red number prefix + horizontal rule. Cards have hard CSS drop shadow that shifts on hover.

**Key differentiator from prior designs:** Structural 2-column layout, IBM Plex Mono as the primary UI font (not secondary), hard drop shadows, zero rounded corners, newspaper section numbering, massive display headline.

---

### Proposal B: Signal

**Branch:** `design/proposal-b-2026-03-18`
**Genre:** Ambient dark audio app (Spotify/Tidal meets academic content)
**Screenshot:** `screenshots/proposal-b-2026-03-18.png`
**Dev server port:** 3002

**Mood:** Late-night research with headphones on. The interface disappears and only the content glows. Premium, focused, neon-tinged.

**Palette:**
- Background: `#0a0a0a` (near-black)
- Cards: `#141414` with `rgba(255,255,255,0.08)` border
- Text: `#f0f0f0` primary, `#808080` secondary
- Accent: `#00e5cc` (electric teal)
- Player bar: `#111111` with teal buttons

**Typography:** Quicksand retained. Section labels in teal uppercase. Complete papers get a teal left-border stripe (track listing aesthetic).

**Layout:** Single-column track list. Waveform SVG decoration above the search bar (80 deterministic bars in teal, 20% opacity). Radial teal gradient halo behind hero area. Transparent floating header.

**Key differentiator from prior designs:** Waveform decoration (actual audio-app visual metaphor), neon teal glow hover effects, complete-paper accent stripe, dark bg with floating transparent header, Signal CSS class for contained glow effects.

---

### Proposal C: Foxed

**Branch:** `design/proposal-c-2026-03-18`
**Genre:** Textured warm library / antiquarian bookshop
**Screenshot:** `screenshots/proposal-c-2026-03-18.png`
**Dev server port:** 3003

**Mood:** Amber-lit library stacks. Papers feel like treasured documents. The satisfying weight of a physical collection.

**Palette:**
- Background: `#f5ede0` (aged parchment)
- Cards: `#fdf8f0` with `#c4a882` warm tan border
- Text: `#2c1810` (dark ink brown) primary, `#7a5c44` secondary
- Accent: `#8b3a3a` (deep wine/burgundy)
- Header/footer: `#2c1810` background with `#f5ede0` text + `#8b3a3a` border

**Typography:** Lora serif font added for paper titles and section headers. Creates editorial contrast against Quicksand UI elements.

**Texture/Visual richness:** CSS SVG noise grain overlay (`body::before`, 4% opacity). Decorative star-ornament SVG divider between sections with horizontal rules.

**Layout:** Same single-column structure, but visually transformed by texture + serif typography + warm palette. Cards have warm inner shadow + subtle lift on hover.

**Key differentiator from prior designs:** Actual grain texture overlay (real visual texture, not just color), Lora serif as display font for content titles, ornamental dividers between sections, deep warm header completely unlike any prior design.

---

### Proposal D: Prism

**Branch:** `design/proposal-d-2026-03-18`
**Genre:** Glassmorphism / premium tech aesthetic
**Screenshot:** `screenshots/proposal-d-2026-03-18.png`
**Dev server port:** 3004

**Mood:** Dreamy, depth-rich interface where content floats on a vivid gradient field. Like a flagship iOS app or Arc browser.

**Palette:**
- Background: `#0f0520` (deep purple-black) with mesh gradient orbs
- Orbs: violet `rgba(139,92,246,0.4)`, blue `rgba(59,130,246,0.35)`, pink `rgba(236,72,153,0.25)`
- Cards: `rgba(255,255,255,0.07)` glass with `rgba(255,255,255,0.12)` border
- Text: `rgba(255,255,255,0.95)` primary, `rgba(255,255,255,0.55)` secondary
- Accent: `#a78bfa` (violet-400)
- Player bar: glass panel `rgba(15,5,32,0.85) + backdrop-blur-xl`

**Typography:** Quicksand retained, violet-tinted section labels.

**Texture/Visual richness:** Three large fixed-position gradient orbs (violet/blue/pink) with `filter: blur(80-120px)` create persistent mesh gradient. Cards use `backdrop-filter: blur(16px)` for frosted glass. Gradient bleeds through cards creating real depth.

**Layout:** Same structure but all cards are glass panels (`rounded-2xl`, no opaque backgrounds). Header is fully glass. Orbs are `position: fixed` behind everything.

**Key differentiator from prior designs:** Fixed gradient orb system (not a CSS gradient on `body` but actual DOM elements creating layered depth), real `backdrop-filter: blur` on cards (requires the background to be visible through cards), violet player bar.

---

## Directions NOT YET EXPLORED (for future runs)

The following design territories have not been tried. Future proposals should pull from these:

- ~~**Brutalist / raw typography**~~ — done as Broadsheet (2026-03-18)
- ~~**Glassmorphism**~~ — done as Prism (2026-03-18)
- ~~**Ambient audio app**~~ — done as Signal (2026-03-18)
- ~~**Textured paper / library**~~ — done as Foxed (2026-03-18)
- **Newspaper / archive terminal** — monospace everywhere, dense columns, scanline aesthetics, microfiche terminal feel
- **Illustrated / indie web** — decorative SVG elements, hand-drawn borders, character and warmth
- **Sci-fi / data viz** — cyan on black, grid lines, technical readout aesthetic, academic-as-scientific-instrument
- **Luxury editorial** — massive whitespace, oversized serif display type, one strong accent color, fashion-magazine restraint
- **Magazine masonry** — card grid with varied sizes, hero paper featured large, editorial hierarchy
- **High contrast accessibility** — purposefully designed around readability, not just accessible by default
