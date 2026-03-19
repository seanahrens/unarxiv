# unarXiv Review — 2026-03-19

## Changes Made

### refactor: remove dead no-op state and effect from PlayerBar

`PlayerBar.tsx` contained `const [barHeight] = useState(0)` (unused) and
`useEffect(() => {}, [])` (empty effect with no purpose). A comment acknowledged
these were placeholders to "preserve hook order" — a pattern no longer needed
with modern React. Both lines removed.

### refactor: extract duplicate formatEtaShort(detail) to api.ts

`PaperCard.tsx` and `admin/page.tsx` both defined identical local functions:
```ts
function formatEtaShort(detail: string | null): string | null { ... }
```
These parsed a `progress_detail` string and returned a short ETA label like
`"~2m"` or `"~30s"`. Extracted to a shared `formatEtaShort` export in `api.ts`
and updated both call sites to import it. (`PaperActionButton.tsx` has a
different signature — `formatEtaShort(seconds: number)` — and is intentionally
kept local.)

### fix: add missing myAdditions dep to polled-sync effect in my-papers

`my-papers/page.tsx` had a `useEffect` that compared `polledAdditions` against
`myAdditions` to detect status changes, but `myAdditions` was missing from the
dependency array. This created a stale closure where comparisons could reference
outdated paper statuses from a previous render cycle. Added `myAdditions` to
`[polledAdditions, myAdditions]`.

### fix: document synthetic not_found status cast in collection list view

`l/page.tsx` constructs placeholder `Paper` objects for deleted collection items
using `status: "not_found"`, which is outside the `PaperStatus` union type. The
construction was silently type-unsafe. Added `as Paper["status"]` cast and an
explanatory comment so the intent is visible and the type coercion is explicit.

## Left Unchanged (Identified, Needs Human Decision)

- **Worker `index.ts`** (~1100 lines): Could be split into route modules. High
  scope for an automated run.
- **`db.ts`** (~830 lines): Could be split by domain (papers, ratings, lists,
  playlist). Safe but large.
- **`PaperActionButton.tsx` local `formatEtaShort(seconds: number)`**: Intentionally
  different signature from the now-shared `formatEtaShort(detail: string | null)`.
  Could be renamed `formatEtaShortFromSeconds` for clarity — human decision.
- **Design system**: Shared Button/Modal/Badge components would reduce duplication
  in modals across `PaperPageContent.tsx`, `admin/page.tsx`, and others. Recommend
  evaluating shadcn/ui — human decision.
- **`STATUS_LABELS` in multiple components**: Intentionally different labels
  (`"In Progress"` vs. `"Scripting"/"Narrating"`) — not a duplicate.
- **Turnstile currently disabled**: No action taken; noted in CLAUDE.md.

## Deploy Status

- **Worker** (`unarxiv-api`): Version `de10061a-07ad-4048-9aec-a8a8c72e89d6` — deployed 2026-03-19
- **Frontend** (`unarxiv-frontend`): Deployment `06723af6` — deployed 2026-03-19
