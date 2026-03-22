# unarXiv Review — 2026-03-22

## Changes Made

### refactor(worker): remove dead `handleAdminMigrateListIds` endpoint

**File:** `unarxiv-web/worker/src/index.ts`

A one-time migration endpoint that converted lists with IDs shorter than 6
characters to the 6-char format introduced when list IDs were standardized.
The migration ran when the ID format changed; the endpoint now always returns
`{ message: "No short list IDs to migrate", migrated: 0 }`. Removed the
function body (~30 lines) and its route table entry (`POST /api/admin/migrate-list-ids`).

### docs(worker): replace stale route list with pointer to `buildRouteTable`

**File:** `unarxiv-web/worker/src/index.ts`

The file-header JSDoc comment listed ~12 original API routes, but the worker
has grown to 40+ endpoints. The comment was misleading — it implied a complete
summary when it was just historical. Replaced the stale route listing with a
one-liner: "See `buildRouteTable()` below for the complete list of API routes."
The route table itself is the self-documenting source of truth.

### refactor(frontend): deduplicate `PremiumNarrationModal` in `PaperActionButton`

**File:** `unarxiv-web/frontend/src/components/PaperActionButton.tsx`

The component had three early-return branches (narrated / narrating /
unnarrated+failed), each with an identical copy of:

```jsx
{showPremiumModal && (
  <PremiumNarrationModal
    paper={paper}
    onClose={() => setShowPremiumModal(false)}
  />
)}
```

Converted the early-return branches to inline conditionals inside a single
`return`, allowing the modal to render once at the end of the component.
Also extracted the `openPremiumModal` callback to avoid 3 duplicate
`() => { setShowPremiumModal(true); toggleMenu(false); }` arrow functions,
and removed the unused `isEnhanced` variable. Net: -15 lines.

### fix(scheduled-task): correct SKILL.md deploy commands

**File:** `/Users/seanahrens/.claude/scheduled-tasks/daily-codebase-review/SKILL.md`
(updated via `mcp__scheduled-tasks__update_scheduled_task`)

The deploy step in the scheduled task had two bugs:
1. Worker deploy used `npx wrangler deploy` (missing `--config wrangler.production.toml`
   — would deploy against the placeholder DB ID in `wrangler.toml`)
2. Frontend deploy used `--project-name=texreader-frontend` (old name — correct name
   is `unarxiv-frontend` per CLAUDE.md)

Both corrected. This was a silent bug that would cause all future automated deploys
from this task to fail or target the wrong project.

---

## Left Unchanged (Identified, Needs Human Decision)

- **`/api/my-additions` worker routes** — `GET /api/my-additions` and
  `DELETE /api/my-additions/:id` are still registered in the worker but have no
  frontend callers. The handlers are functional. Leaving intact pending a human
  decision on whether to wire them to a "My Additions" UI or remove them.
- **`worker/src/index.ts` size** (~1065 lines after today's removals) and
  **`db.ts`** (~830 lines): Both remain large monolithic files. Splitting by
  domain (papers, ratings, lists, playlist) is the right long-term direction but
  is a high-blast-radius change deferred for deliberate human planning.
- **Design system** — No shared `Button`/`Modal`/`Badge` components. All repeated
  patterns already have page-specific components. shadcn/ui would reduce some
  duplication in modals but is a significant dependency addition — human decision.
- **`formatEtaShort` naming** — The local `formatEtaShort(seconds: number)` in
  `PaperActionButton.tsx` takes seconds (a number), while `api.ts` has no
  `formatEtaShort` export (previously noted as a potential rename candidate —
  this was a false alarm from a prior REVIEW.md; the local function is fine as-is).

---

## Deploy Status

- **Worker** (`unarxiv-api`): Version `4cda7831-40f1-4a2f-94a1-6eb3cdb9663b` — deployed 2026-03-22
- **Frontend** (`unarxiv-frontend`): Deployment `ce77cf9f` — deployed 2026-03-22
