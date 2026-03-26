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
  - `regex_scripter/` — active regex scripter (default), modular LaTeX+PDF → TTS script
  - `llm_scripter.py` — LLM-based script upgrader (+ `llm_providers.py`, `figure_utils.py`, `latex_post_process.py`)
  - `tts_utils.py` — TTS utilities (chunking, voice, tagging) shared by both scripters
  - `legacy_regex_scripter.py` — old monolithic scripter, switchable via `SCRIPTER_VERSION=legacy`

## Key Config

- D1 database: `unarxiv-db` (ID: `f87529b5-2f6c-43a9-988c-92f41e0a790e`)
- R2 bucket: `unarxiv-audio` (audio + transcripts)
- Domain: `unarxiv.org` (frontend), `api.unarxiv.org` (worker API)
- `wrangler` is invoked via `npx wrangler` (install with `npm install -g wrangler` or use local devDep)
- Admin password stored as Worker secret (`ADMIN_PASSWORD`)
- Rate limits: 24/day/IP (default, set via `PER_IP_DAILY_LIMIT`); `DAILY_GLOBAL_LIMIT` env var exists but is not currently enforced in code

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
# Worker API (wrangler.toml has a placeholder DB ID; use production config)
cd unarxiv-web/worker && npx wrangler deploy --config wrangler.production.toml

# Frontend
cd unarxiv-web/frontend && npm run build
npx wrangler pages deploy out --project-name=unarxiv-frontend

# Modal worker
cd unarxiv-web/modal_worker && modal deploy narrate.py
```

## Database

Schema in `unarxiv-web/schema.sql`. Paper statuses: `unnarrated → narrating → narrated | failed`.

### Narration dispatch flow

When a user clicks "Narrate", the worker dispatches to Modal immediately:

1. `handleNarratePaper` atomically claims the paper via `claimPaperForNarration()` — a single `UPDATE ... WHERE status IN ('unnarrated', 'failed')` so only one concurrent caller wins the race. Also allows retry from `failed`.
2. The winner dispatches to Modal via `ctx.waitUntil()` (runs after HTTP response is sent). Sets `eta_seconds = 55` as a default estimate.
3. All callers get a 200 with the paper in `narrating` status.
4. Modal calls back to `/api/webhooks/modal` with status updates and `eta_seconds` (real chunk-based ETA).
5. On dispatch failure, paper reverts to `unnarrated` (user can retry).

**ETA tracking**: `eta_seconds` is an integer column on the papers table. The worker sets it to 55 on claim, Modal updates it with real chunk-based estimates (~5s per chunk). The frontend reads it directly — no string parsing.

**Safety net**: A cron job (every 15 min) re-dispatches papers stuck in `narrating` for >20 min.

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
- DB is seeded with sample papers in all statuses (narrated, narrating, failed, unnarrated)
- Modal narration is skipped locally — simulate completion via webhook:
  ```bash
  curl -X POST http://localhost:8787/api/webhooks/modal \
    -H 'Content-Type: application/json' \
    -d '{"arxiv_id":"PAPER_ID","status":"narrated","duration_seconds":600,"eta_seconds":0}'
  ```
- R2 is emulated locally by wrangler (audio files won't exist but UI renders)
- `./dev.sh reset` wipes and re-seeds the local database

## Conventions

- Tailwind CSS with stone color palette
- No confirm dialogs on individual actions, only bulk operations
- Bot protection: Cloudflare Turnstile integrated but currently disabled (worker stub in `narration.ts`, frontend widget in `TurnstileWidget.tsx`)
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
