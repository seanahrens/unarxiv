# unarXiv Review

## Completed

- **Route dispatch table refactor**: Replaced the ~40-branch linear if-chain in `handleRequest` (`worker/src/index.ts`) with a declarative `RouteEntry[]` table. All inline handler logic extracted into named functions. `npx tsc --noEmit` passes cleanly.
- **Re-scrape removal in `handleNarratePaper`**: Uses `arxivSrcUrl(id)` directly to compute `tex_source_url`; no arXiv scrape on narration request.
- **Stale file cleanup**: Removed legacy `AudioPlayer.tsx` component and root-level `tex_to_audio.py` copy.
- **`L1ST` page title artifact**: Removed; no matches remain in codebase.
- **`confirm()` dialog removal**: Individual delete/action buttons in playlist and list pages no longer use `confirm()`; bulk operations retain confirmation.
- **Hydration fix**: Resolved SSR/client hydration mismatches in playlist and list pages.
- **Dead Turnstile code removed**: Removed commented-out `verifyTurnstile` call and function definition from `index.ts`.
- **Type-safe `request.cf`**: Replaced `(request as any).cf` casts with properly typed `IncomingRequestCfProperties` import.
- **`const values: any[]` → typed array** in `db.ts` `updatePaperStatus`.
- **Rename `audioBaseUrl` → `apiOrigin`** in `types.ts` `paperToResponse`.
- **`LIST_ID_PATTERN` constant**: Extracted and used across all 7 list route regex patterns.
- **`addListItems` batch inserts**: Replaced per-item loop with `db.batch()` in `db.ts`.
- **`ListSubmenu` membership cache**: Added `membershipCache` ref to avoid redundant re-fetches.
- **`PaperListRow` component**: Extracted shared paper row pattern from three sites into a reusable component.
- **Silent error in `handleSave`**: Changed `catch {}` to logged error in `l/page.tsx`.
- **`text-2xs`/`text-3xs` Tailwind tokens**: Registered in `globals.css` `@theme` block; replaced raw pixel values across components.
- **`getCombinedToken` renamed to `getFirstOwnerToken`** in `lists.ts`.

## Outstanding

No outstanding issues.

## Deploy Status

- **Worker** (`unarxiv-api`): Version `421aa5b4-63d0-4993-8ae2-9ea15f0882bd` — deployed 2026-03-17
- **Frontend** (`texreader-frontend`): Deployment `7d12a46b` — deployed 2026-03-17
