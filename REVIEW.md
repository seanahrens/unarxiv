# unarXiv Review — 2026-03-18

## Changes Made

### docs: fix `/playlist` route in CLAUDE.md
- CLAUDE.md documented the personal library page as `/playlist`, but the Next.js page lives at `app/my-papers/page.tsx` and all in-app navigation links reference `/my-papers`.

### refactor: extract `parseEtaSeconds` to `api.ts`
- `PaperCard.tsx` and `NarrationProgress.tsx` both contained identical regex logic to parse `"eta:240"` from `progress_detail` strings. Extracted to a single `parseEtaSeconds()` utility in `api.ts`; both components now import and use it.

### fix(types): remove unnecessary `as any` cast in `PaperPageContent.tsx`
- `setPaper({ ...paper, status: "queued" as any })` — `Paper.status` is typed as `string`, so the literal `"queued"` needs no cast.

## Left Unchanged (Identified, Needs Human Decision)

- **Worker `index.ts` (1086 lines)**: Large refactor to split into route modules. Low risk but high scope for an automated run.
- **`db.ts` (596 lines)**: Could be split by domain (papers, ratings, lists). Safe but large.
- **Design system adoption**: Codebase has reached a point where shared Button/Modal/Badge components would reduce duplication. Recommend evaluating shadcn/ui — human decision.
- **`STATUS_LABELS` in two components**: The labels are intentionally different ("In Progress" vs. "Scripting"/"Narrating") — not a duplicate, left as-is.
- **Turnstile currently disabled**: No action taken; noted in CLAUDE.md.

## Deploy Status

- **Worker** (`unarxiv-api`): Version `724a36ca` — deployed 2026-03-18
- **Frontend** (`unarxiv-frontend`): Deployment `9aacf3dd` — deployed 2026-03-18
