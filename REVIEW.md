# unarXiv Codebase Review — 2026-03-17

## Changes Made This Session

All changes landed in `refactor/daily-review-2026-03-17`, merged to `main`, pushed, and deployed.

### Worker (`unarxiv-web/worker/`)

1. **Extract `recomputeBayesianAvg` helper in `db.ts`**
   The `PRIOR_WEIGHT = 2` / `PRIOR_MEAN = 3.0` constants and the 10-bind Bayesian average SQL were copy-pasted between `upsertRating` and `deleteRatingForIp`. Extracted to a private `recomputeBayesianAvg(db, paperId)` function. Both callers now invoke it. Added a comment explaining the Bayesian prior choice.
   - File: `unarxiv-web/worker/src/db.ts`

2. **Add Modal.com comment; remove redundant authors type guard in `index.ts`**
   Added a clarifying comment to `handleModalWebhook` noting "Modal" = Modal.com platform, not a UI dialog. Removed the `typeof paper.authors === "string" ? ... : ...` guard in `handleReprocessPaper` — `paper.authors` is always a JSON string from D1, so the runtime check was dead code.
   - File: `unarxiv-web/worker/src/index.ts`

### Frontend (`unarxiv-web/frontend/`)

3. **Clean up `PaperPageContent.tsx`**
   Three changes in one commit:
   - Removed trivial `formatDate` wrapper function; call site now calls `formatPaperDate()` directly.
   - Removed `checkNarrationRateLimit` pre-flight call (Turnstile is currently disabled; the call added a wasteful round-trip before every narration request). Turnstile is now handled reactively: if the narrate endpoint returns a Turnstile error, the captcha modal is shown.
   - Replaced inline `style={{ borderRadius: ... }}` and `style={{ marginLeft: "-1px" }}` on the split buttons with Tailwind utility classes (`rounded-l-xl`, `rounded-r-xl`, `-ml-px`).
   - File: `unarxiv-web/frontend/src/app/p/PaperPageContent.tsx`

4. **Extract purple progress gradient from `PaperCard` inline style to CSS class**
   `PaperCard.tsx` had a long inline `style={{ background: "repeating-linear-gradient(..." }}` for the in-progress indicator. Extracted to `.progress-flow-purple` in `globals.css`, alongside the existing `.progress-flow` (blue variant). Both classes are now documented in the CSS with a comment noting the intentional color difference (blue = narration progress bar; purple = subtle in-list processing state).
   - Files: `unarxiv-web/frontend/src/components/PaperCard.tsx`, `unarxiv-web/frontend/src/app/globals.css`

5. **Remove `confirm()` dialogs from individual actions in playlist page**
   `playlist/page.tsx` had two `confirm()` dialogs on individual (non-bulk) actions, violating the CLAUDE.md convention "No confirm dialogs on individual actions, only bulk operations":
   - `if (!confirm("Delete this list? This cannot be undone.")) return;`
   - `if (!confirm("Remove this paper from unarXiv?")) return;`
   Both removed.
   - File: `unarxiv-web/frontend/src/app/playlist/page.tsx`

6. **Remove `confirm()` from individual delete collection action in `l/page.tsx`**
   Same convention violation: `if (!confirm("Delete this collection permanently? This cannot be undone.")) return;` removed from `handleDelete`.
   - File: `unarxiv-web/frontend/src/app/l/page.tsx`

7. **Rename `getCombinedToken` to `getFirstOwnerToken` in `lists.ts`**
   The old name implied it merged tokens from multiple lists. In practice it returns the first stored owner token for `my-lists` header queries. Renamed for accuracy. The function is exported but currently not called from any page (it is available for future use). Updated JSDoc comment.
   - File: `unarxiv-web/frontend/src/lib/lists.ts`

---

## Deployment Status

- Build: `next build` — clean, no TypeScript errors
- Worker TypeScript: `tsc --noEmit` — clean
- Worker deploy: deployed to `unarxiv-api.seanahrens.workers.dev` (Version: `f3026ead`)
- Frontend deploy: deployed to Cloudflare Pages (`texreader-frontend`)

---

## Outstanding Issues (Not Fixed This Session)

The items below were identified but not addressed. They are ordered by estimated impact.

### High priority

1. **Re-scrape in `handleNarratePaper`** (`index.ts` ~line 751)
   Every narration dispatch calls `await scrapeArxivMetadata(id)` even though the metadata was already stored in D1. Use `arxivSrcUrl(id)` from `arxiv.ts` instead. Eliminates an outbound HTTP call on every narration request.

2. **`addListItems` inserts one-at-a-time** (`db.ts` lines ~573–593)
   Replace the per-item insert loop with `db.batch()`. Reduces D1 round-trips from N to 1 for bulk imports.

3. **`ListSubmenu` fetches full list on every open** (`src/components/ListSubmenu.tsx` lines ~22–39)
   Fires one `fetchList` call per owned collection each time the submenu opens. A membership check endpoint or including `paper_ids` in `/api/my-lists` would be far cheaper.

### Medium priority

4. **Dead code cleanup**
   - `src/components/AudioPlayer.tsx` — not imported anywhere; superseded by `HeaderPlayer` + `AudioContext`
   - `verifyTurnstile` in `index.ts` — defined but never called
   - `getNarrationCountLastHour` in `db.ts` — only referenced in commented-out Turnstile block

5. **`PaperListRow` component extraction**
   The paper row pattern (icon + title/author block + action button) is repeated across `DraggablePaperList.tsx`, the "My Additions" section in `playlist/page.tsx`, and the "Listen History" section in `playlist/page.tsx`. Extract into a shared component.

6. **Silent error in `handleSave` in `l/page.tsx`**
   The `catch {}` block swallows save errors. Users get no feedback on failure. Should at minimum log; ideally surface a toast.

7. **`unarXiv L1ST` page title in `l/page.tsx` line ~118**
   `document.title = \`${data.list.name} — unarXiv L1ST\`` — "L1ST" is inconsistent with the rest of the brand. Should be "unarXiv Collections" or similar.

8. **`audioBaseUrl` parameter name in `paperToResponse` (types.ts ~line 91)**
   The parameter receives the full API origin URL, not a base URL for audio. Rename to `apiOrigin`.

9. **`tex_to_audio.py` exists at two paths**
   - `unarxiv-web/modal_worker/tex_to_audio.py` — the authoritative production copy (deployed via Modal)
   - `/tex_to_audio.py` at the repo root — development artifact
   Edits to the root copy do not affect production. The root copy should be removed or symlinked to the modal_worker copy.

### Low priority

10. **`request.cf` cast to `any`** in `index.ts` (~lines 500, 666)
    Use `IncomingRequestCfProperties` from `@cloudflare/workers-types` for type safety.

11. **`type any` in `db.ts` line ~81**: `const values: any[] = [status]` — use `(string | number | null)[]`.

12. **Repeated `text-[11px]` / `text-[10px]` arbitrary Tailwind values**
    Register `text-2xs` in `@theme` to avoid repeated bracket syntax.

13. **Magic 4-char list ID regex duplicated 4 times** in `index.ts`
    Extract `const LIST_ID_PATTERN = "[a-z0-9]{4}"` and reference it.

14. **Route dispatch is a linear if-chain** (~30 blocks in `handleRequest`)
    A route table (object mapping `"METHOD /path"` → handler) would make the route inventory self-documenting and greppable.
