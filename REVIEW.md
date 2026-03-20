# unarXiv Review — 2026-03-20

## Changes Made

### refactor: remove three unused component files

Audited every component in `src/components/` by scanning for imports across
all `.tsx`/`.ts` files. Three files had zero importers:

- **`HeaderPlayer.tsx`** — An alternate player UI (title, seekbar, controls)
  that was superseded by `PlayerBar.tsx`. Never imported after the refactor.
- **`ContactEmail.tsx`** — A Turnstile-gated email reveal widget. Turnstile
  is currently disabled; the About page's "Get in touch" section uses plain
  text ("hello at this domain") and never renders this component.
- **`ProcessingFileIcon.tsx`** — An SVG icon for in-progress narration files.
  No longer referenced after the icon set was consolidated into `AudioFileIcon`
  and `FileIcon`.

All three deleted. Total: 190 lines removed.

### refactor: remove unused fetchMyAdditions and deleteMyAddition from api.ts

`fetchMyAdditions()` and `deleteMyAddition()` were exported from `lib/api.ts`
and call `/api/my-additions` (GET) and `/api/my-additions/:id` (DELETE)
respectively. Neither function is imported or called by any page or component.
The corresponding worker routes remain intact — only the dead client-side stubs
are removed (20 lines). The routes can be wired up to a page in the future if
the "my additions" feature is revived.

## Left Unchanged (Identified, Needs Human Decision)

- **Worker `index.ts`** (~1100 lines) and **`db.ts`** (~830 lines): Both are
  large files that could be split by domain (papers, ratings, lists, playlist).
  Deferred again — splitting these is safe but high-blast-radius and warrants
  deliberate human planning rather than autonomous refactoring.
- **`/api/my-additions` worker routes**: The GET and DELETE routes still exist
  in `worker/src/index.ts`. They're functional but nothing in the frontend calls
  them. Could be removed or wired to a UI — human decision.
- **Design system**: Still no shared `Button`/`Modal`/`Badge` components. Inline
  SVGs throughout. Evaluating shadcn/ui would reduce duplication in modals
  (`PaperPageContent.tsx`, `admin/page.tsx`, etc.) — human decision.
- **`PaperActionButton.tsx` local `formatEtaShort(seconds: number)`**: Has a
  different signature from the shared `formatEtaShort(detail)` in `api.ts`.
  Could be renamed `formatEtaShortFromSeconds` for clarity — human decision.

## Deploy Status

- **Worker** (`unarxiv-api`): Version `1a3685c0-cf1a-414b-8dba-ef48726fd73a` — deployed 2026-03-20
- **Frontend** (`unarxiv-frontend`): Deployment `9ebd5b35` — deployed 2026-03-20

## Notes

Worker must be deployed with `--config wrangler.production.toml` (the default
`wrangler.toml` contains a placeholder database ID per a comment in that file).
The deploy command in `CLAUDE.md` should be updated to reflect this.
