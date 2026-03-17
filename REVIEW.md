# unarXiv Codebase Review — 2026-03-17 (outstanding items session)

## What Was Done

All items carried over as "Outstanding Issues" from the prior daily review session were addressed. Changes landed in `refactor/outstanding-2026-03-17`, merged to `main`, pushed, and deployed.

### Worker (`unarxiv-web/worker/`)

1. **Remove dead Turnstile code** (`index.ts`)
   Removed the commented-out `getNarrationCountLastHour` call, `verifyTurnstile` call, and the full `verifyTurnstile` function definition. The code had been disabled but left in place; it now no longer exists in the file.

2. **Type-safe `request.cf`** (`index.ts`)
   Replaced two `(request as any).cf` casts with `(request as Request<unknown, IncomingRequestCfProperties>).cf` using the imported type from `@cloudflare/workers-types`. Changed `|| null` to `|| undefined` on `cf?.country` and `cf?.city` to satisfy the `string | undefined` signature expected by `insertPaper`.

3. **`const values: any[]` → typed array** (`db.ts`)
   Changed `const values: any[] = [status]` in `updatePaperStatus` to `const values: (string | number | null)[] = [status]`.

4. **Rename `audioBaseUrl` → `apiOrigin`** (`types.ts`)
   Parameter to `paperToResponse` renamed to accurately reflect it receives the full API origin URL, not just a base path for audio.

5. **Extract `LIST_ID_PATTERN` constant** (`index.ts`)
   Added `const LIST_ID_PATTERN = "[a-z0-9]{4}"` before `handleRequest`. All 7 hardcoded occurrences of `[a-z0-9]{4}` in route regex patterns replaced with `new RegExp(...)` using the constant.

6. **`addListItems` batch inserts** (`db.ts`)
   Replaced the per-item insert loop with `db.batch()`, reducing D1 round-trips from N to 1 for bulk imports.

### Frontend (`unarxiv-web/frontend/`)

7. **`ListSubmenu` membership cache** (`ListSubmenu.tsx`)
   Added a `membershipCache` ref to avoid re-fetching all list memberships every time the submenu opens for the same paper. Cache is invalidated when the `paperId` changes and kept in sync when items are toggled.

8. **Extract `PaperListRow` component** (new: `PaperListRow.tsx`)
   The paper row pattern (status icon + title/authors block + action slot) was duplicated across `DraggablePaperList.tsx`, the "My Additions" section in `playlist/page.tsx`, and the "Listen History" section in `playlist/page.tsx`. Extracted into a shared `PaperListRow` component with `actions` and `extra` slot props. All three sites refactored to use it.

9. **Silent error in `handleSave`** (`l/page.tsx`)
   Changed `catch {}` to `catch (e: unknown) { console.error("Failed to save collection:", e); }` so errors are no longer swallowed silently.

10. **Register `text-2xs` and `text-3xs` in `@theme`** (`globals.css`)
    Added custom size tokens (`--text-2xs: 0.6875rem`, `--text-3xs: 0.625rem`) to the `@theme` block. Replaced all `text-[11px]` and `text-[10px]` occurrences in `layout.tsx`, `HeaderPlayer.tsx`, `NarrationProgress.tsx`, `PaperCard.tsx`, and `l/page.tsx` with the named utilities.

---

## What Was Skipped

- **Re-scrape in `handleNarratePaper`** (item 1 from outstanding list): This is a behavioral change that needs more careful testing to ensure `arxivSrcUrl` is always an adequate substitute for the live scrape. Deferred.
- **Route dispatch table refactor** (item 14): Large structural change with no immediate bug fix. Deferred.
- **Remove `AudioPlayer.tsx` dead file**: The file exists but removing it is a separate cleanup commit that can be done independently.
- **`tex_to_audio.py` duplicate at repo root**: File removal confirmed as out of scope for this refactor session.
- **`unarXiv L1ST` page title**: Copy change, deferred to content/UX pass.

---

## Deploy Status

- `npm run build` (frontend): clean, zero errors
- `npx tsc --noEmit` (worker): clean, zero errors
- Worker deployed: `unarxiv-api` version `ca9a1149-518c-41f9-af28-2678dddfc144`
- Frontend deployed: `https://f249d701.texreader-frontend.pages.dev`
