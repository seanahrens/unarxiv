# unarXiv

Public website for converting arXiv LaTeX papers into narrated MP3 audiobooks.

## Architecture

```
Browser → Cloudflare Pages (Next.js) → Cloudflare Workers (API) → D1 (SQLite) + R2 (audio/transcripts)
                                                                 → Modal (Python narration worker)
```

- **Frontend**: `unarxiv-web/frontend/` — Next.js on Cloudflare Pages
- **API**: `unarxiv-web/worker/` — Cloudflare Workers (TypeScript), bindings in `wrangler.toml`
- **Narration**: `unarxiv-web/modal_worker/` — Modal serverless Python, wraps `tex_to_audio.py`

## Key Config

- D1 database: `unarxiv-db` (ID: `f87529b5-2f6c-43a9-988c-92f41e0a790e`)
- R2 bucket: `texreader-audio` (audio + transcripts) — legacy name, can't rename without migration
- Domain: `unarxiv.org` (frontend), `api.unarxiv.org` (worker API)
- `wrangler` is invoked via `npx wrangler` (install with `npm install -g wrangler` or use local devDep)
- Admin password stored as Worker secret (`ADMIN_PASSWORD`)
- Rate limits: 10/day/IP, global daily cap configurable via `DAILY_GLOBAL_LIMIT`

## Deployment

Source the Cloudflare API token before deploying (adjust path as needed):
```bash
export $(cat .env | xargs)
```

```bash
# Worker API
cd unarxiv-web/worker && npx wrangler deploy

# Frontend
cd unarxiv-web/frontend && npm run build
npx wrangler pages deploy out --project-name=texreader-frontend

# Modal worker
cd unarxiv-web/modal_worker && modal deploy narrate.py
```

## Database

Schema in `unarxiv-web/schema.sql`. Paper statuses: `queued → preparing → generating_audio → complete | failed`.

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

## Conventions

- Tailwind CSS with stone color palette
- No confirm dialogs on individual actions, only bulk operations
- Bot protection: Cloudflare Turnstile integrated but currently disabled (code in `worker/src/index.ts`)
- Popularity: unique visits per IP per paper (not per-view)

## Routes

- `/` — homepage with search, popular, and newly-added paper sections
- `/p?id=<arxiv_id>` — paper detail page with audio player and narration controls
- `/s?id=<arxiv_id>` — narration script/transcript viewer
- `/playlist` — user's local playlist, listen history, additions, and collections
- `/l?id=<list_id>` — public/edit view for a user collection (also `/l/<list_id>` short URL)
- `/abs/<arxiv_id>` — redirects to `/p?id=<arxiv_id>` (Cloudflare Pages Function)
- `/admin` — admin dashboard (password-gated)
- `/admin/curate` — paper management with bulk reprocess/delete
