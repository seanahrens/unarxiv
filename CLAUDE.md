# PapEar (TexReader)

Public website for converting arXiv LaTeX papers into narrated MP3 audiobooks.

## Architecture

```
Browser → Cloudflare Pages (Next.js) → Cloudflare Workers (API) → D1 (SQLite) + R2 (audio/transcripts)
                                                                 → Modal (Python narration worker)
```

- **Frontend**: `texreader-web/frontend/` — Next.js on Cloudflare Pages
- **API**: `texreader-web/worker/` — Cloudflare Workers (TypeScript), bindings in `wrangler.toml`
- **Narration**: `texreader-web/modal_worker/` — Modal serverless Python, wraps `tex_to_audio.py`

## Key Config

- D1 database: `texreader-db` (ID: `d1936353-a389-4f38-a109-79db70cc44ef`)
- R2 bucket: `texreader-audio` (audio + transcripts)
- Domain: `papers.aixdemocracy.fyi`
- `wrangler` is available at `/usr/local/bin/npx wrangler` (must set PATH)
- Admin password stored as Worker secret (`ADMIN_PASSWORD`)
- Rate limits: 10/day/IP, global daily cap configurable via `DAILY_GLOBAL_LIMIT`

## Deployment

```bash
# Worker API
cd texreader-web/worker && npx wrangler deploy

# Frontend
cd texreader-web/frontend && npm run build
npx wrangler pages deploy out --project-name=texreader-frontend

# Modal worker
cd texreader-web/modal_worker && modal deploy narrate.py
```

## Database

Schema in `texreader-web/schema.sql`. Paper statuses: `queued → preparing → generating_audio → complete | failed`.

D1 migrations must be run with:
```bash
npx wrangler d1 execute texreader-db --remote --command="SQL HERE"
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
- Bot protection: Cloudflare Turnstile on paper submission only
- Popularity: unique visits per IP per paper (not per-view)
