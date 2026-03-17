# Daily Codebase Review — 2026-03-17

## Summary

Three commits consolidating duplicated patterns across the frontend and backend.

---

## Changes

### 1. Shared helpers in `lib/api.ts`

**File:** `unarxiv-web/frontend/src/lib/api.ts`

Added four exported utility functions:

- `isInProgress(status)` — replaces the inline 3-element array literal `["queued", "preparing", "generating_audio"].includes(...)` that appeared in 5 places across 4 files.
- `formatAuthors(authors, maxShown?)` — replaces copy-pasted `slice(0, 3).join(", ") + " +N more"` patterns that appeared in 4 places across 3 files. Accepts an optional `maxShown` parameter so the mobile (1 author) and desktop (3 authors) variants use the same function.
- `formatPaperDate(dateStr)` — replaces two nearly-identical 9-line local `formatDate()` functions (in `PaperCard.tsx` and `PaperPageContent.tsx`).
- `formatPaperYear(dateStr)` — replaces a local `formatYear()` function in `PaperCard.tsx`.

### 2. Deduplicate components

**Files:** `PaperCard.tsx`, `DraggablePaperList.tsx`, `PaperPageContent.tsx`, `playlist/page.tsx`

Applied the shared helpers, removing:
- ~40 lines of local formatting functions
- 6 inline status-check array literals
- 8 repetitive mobile/desktop author display blocks

`PaperPageContent.tsx` retains a thin `formatDate` wrapper for backward compatibility with its call sites. `isProcessing` variables now call `isInProgress(paper.status)` instead of the brittle three-way negation `!isReady && !isFailed && !isNotRequested`.

### 3. Worker and narration worker cleanup

**Files:** `worker/src/index.ts`, `modal_worker/narrate.py`

- **worker**: Three separate `path.match(/^\/api\/papers\/([^/]+)\/rating$/)` calls (one per HTTP method) consolidated into a single match with method branching inside. Eliminates 2 redundant regex executions and makes the routing structure clearer.
- **narrate.py**: Extracted `_make_r2_client()` factory function, replacing duplicated `boto3.client(...)` construction in `upload_to_r2()` and `_download_from_r2()`. The four environment variable reads (account ID, access key, secret, region) are now in one place.

---

## Dimensions Reviewed

| Dimension | Finding |
|---|---|
| Architecture | No structural issues. Single-responsibility boundaries intact. |
| Naming | `isInProgress`, `formatAuthors`, `formatPaperDate/Year` follow existing conventions. |
| Component reusability | Extracted 4 helpers that were previously inlined in 4-5 components each. |
| Design consistency | Stone color palette usage consistent. No regressions. |
| Redundant code | ~120 lines removed across 7 files. |
| Performance | No hot-path changes. React.memo equality comparator on PaperCard already in place (from prior review). |
| Maintainability | Status check now centralized — adding a new in-progress status value requires changing one line instead of five. |
| AI-agent maintainability | Helpers are well-named with JSDoc; unambiguous call signatures. |
| Documentation accuracy | CLAUDE.md accurate. No changes needed. |

---

## Build

`npm run build` in `unarxiv-web/frontend/` — passed with 0 errors, 0 warnings.
