# unarXiv

Public website for converting arXiv LaTeX papers into narrated MP3 audiobooks.

## Architecture

```
Browser → Cloudflare Pages (Next.js) → Cloudflare Workers (API) → D1 (SQLite) + R2 (audio/transcripts)
                                                                 → Modal (Python narration worker)
```

- **Frontend**: `unarxiv-web/frontend/` — Next.js on Cloudflare Pages
- **API**: `unarxiv-web/worker/` — Cloudflare Workers (TypeScript), bindings in `wrangler.toml`
- **Narration**: `unarxiv-web/modal_worker/` — Modal serverless Python
  - `parser_v2/` — active parser (default), modular LaTeX+PDF → TTS script
  - `tex_to_audio.py` — TTS utilities (chunking, voice, tagging) shared by both parsers
  - `tex_to_audio_legacy.py` — old monolithic parser, switchable via `PARSER_VERSION=legacy`

## Key Config

- D1 database: `unarxiv-db` (ID: `f87529b5-2f6c-43a9-988c-92f41e0a790e`)
- R2 bucket: `unarxiv-audio` (audio + transcripts)
- Domain: `unarxiv.org` (frontend), `api.unarxiv.org` (worker API)
- `wrangler` is invoked via `npx wrangler` (install with `npm install -g wrangler` or use local devDep)
- Admin password stored as Worker secret (`ADMIN_PASSWORD`)
- Rate limits: 10/day/IP, global daily cap configurable via `DAILY_GLOBAL_LIMIT`

### Service Names

| Resource             | Name                   |
|----------------------|------------------------|
| CF Worker API        | `unarxiv-api`          |
| CF Pages (frontend)  | `unarxiv-frontend`     |
| Modal app            | `unarxiv-worker`       |
| Modal secret         | `unarxiv-secrets`      |
| R2 bucket            | `unarxiv-audio`        |

## Deployment

Cloudflare credentials are picked up automatically from the environment (wrangler OAuth login or `CLOUDFLARE_API_TOKEN`). No `.env` sourcing needed if already authenticated.

```bash
# Worker API
cd unarxiv-web/worker && npx wrangler deploy

# Frontend
cd unarxiv-web/frontend && npm run build
npx wrangler pages deploy out --project-name=unarxiv-frontend

# Modal worker
cd unarxiv-web/modal_worker && modal deploy narrate.py
```

## Database

Schema in `unarxiv-web/schema.sql`. Paper statuses: `not_requested → preparing → generating_audio → complete | failed`.

### Narration dispatch flow

When a user clicks "Narrate", the worker dispatches to Modal **immediately** (no queue):

1. `handleNarratePaper` atomically claims the paper via `claimPaperForNarration()` — a single `UPDATE ... WHERE status = 'not_requested'` so only one concurrent caller wins the race.
2. The winner's response triggers `dispatchToModal()` via `ctx.waitUntil()` (runs after HTTP response is sent).
3. All callers (winner + losers) get a 200 with the paper in `preparing` status.
4. Modal calls back to `/api/webhooks/modal` with status updates (`generating_audio`, `complete`, or `failed`).

**Safety net**: A cron job (every 15 min) recovers papers stuck in `preparing` for >15 min (reverts to `queued`) and dispatches any `queued` papers. The `queued` status only exists as a fallback for failed dispatches — normal flow skips it entirely.

D1 migrations must be run with:
```bash
npx wrangler d1 execute unarxiv-db --remote --command="SQL HERE"
```

SQLite CHECK constraints can't be altered — must recreate table to change them. Remember to recreate FTS triggers after table recreation.

## Admin

- `/admin` — password-gated dashboard (sessionStorage persistence)
- `/admin/curate` — paper management with bulk actions
- Admin bypasses rate limits via `X-Admin-Password` header
- Contributors tracked by IP with pseudonymized display

## Local Development

**For preview/verification (agents using `preview_start`):**
1. Start `worker-dev` first, then `frontend-dev` (both defined in `.claude/launch.json`)
2. If the worker returns 500s, the local DB likely needs initialization:
   ```bash
   cd unarxiv-web/worker && npm run db:init && npm run db:seed
   ```
3. If `frontend/.env.local` or `worker/.dev.vars` don't exist, copy from `.example` files:
   ```bash
   cp unarxiv-web/frontend/.env.local.example unarxiv-web/frontend/.env.local
   cp unarxiv-web/worker/.dev.vars.example unarxiv-web/worker/.dev.vars
   ```
4. The frontend's `NEXT_PUBLIC_API_URL` must match the worker's port. If the worker gets
   a different port (e.g. 8789 due to port conflict), update `launch.json`'s frontend
   `runtimeArgs` to match.

**Full setup (interactive/terminal):**
```bash
cd unarxiv-web
./dev.sh setup   # First time: install deps, init DB, seed data, copy env files
./dev.sh         # Start worker (localhost:8787) + frontend (localhost:3000)
```

- Admin password: `localdev`
- Frontend `.env.local` points API to `http://localhost:8787`
- Worker `.dev.vars` provides local secrets (`ADMIN_PASSWORD`, `MODAL_WEBHOOK_SECRET`)
- DB is seeded with sample papers in all statuses (complete, queued, failed, etc.)
- Modal narration is skipped locally — simulate completion via webhook:
  ```bash
  curl -X POST http://localhost:8787/api/webhooks/modal \
    -H 'Content-Type: application/json' \
    -d '{"arxiv_id":"PAPER_ID","status":"complete","duration_seconds":600}'
  ```
- R2 is emulated locally by wrangler (audio files won't exist but UI renders)
- `./dev.sh reset` wipes and re-seeds the local database

## Conventions

- Tailwind CSS with stone color palette
- No confirm dialogs on individual actions, only bulk operations
- Bot protection: Cloudflare Turnstile integrated but currently disabled (code in `worker/src/index.ts`)
- Popularity: unique visits per IP per paper (not per-view)

## Routes

- `/` — homepage with search, popular, and newly-added paper sections
- `/p?id=<arxiv_id>` — paper detail page with audio player and narration controls
- `/s?id=<arxiv_id>` — narration script/transcript viewer
- `/my-papers` — user's local playlist, listen history, additions, and collections
- `/l?id=<list_id>` — public/edit view for a user collection (also `/l/<list_id>` short URL)
- `/abs/<arxiv_id>` — redirects to `/p?id=<arxiv_id>` (Cloudflare Pages Function)
- `/admin` — admin dashboard (password-gated)
- `/admin/curate` — paper management with bulk reprocess/delete
