# unarXiv — Setup Guide

## Prerequisites
- Node.js 18+
- Python 3.9+
- wrangler CLI (`npm install -g wrangler && wrangler login`)
- modal CLI (`pip3 install modal && modal token set`)

## 1. Create Cloudflare Resources

```bash
cd worker

# Create D1 database
wrangler d1 create unarxiv-db
# Copy the database_id from the output into wrangler.toml

# Create R2 bucket (note: existing deployment uses legacy name "unarxiv-audio")
wrangler r2 bucket create unarxiv-audio

# Initialize the database schema
wrangler d1 execute unarxiv-db --file=../schema.sql

# Set secrets
wrangler secret put TURNSTILE_SECRET_KEY
# Paste: 0x4AAAAAACq7EvjiQbf606swYiiKiiC0nis

wrangler secret put MODAL_WEBHOOK_SECRET
# Choose a strong random secret and save it for Modal setup too
```

## 2. Deploy Modal Worker

```bash
cd modal_worker

# Create Modal secret with R2 credentials
# First, create R2 API token at: https://dash.cloudflare.com > R2 > Manage R2 API Tokens
modal secret create unarxiv-secrets \
  R2_ACCOUNT_ID=<your-cloudflare-account-id> \
  R2_ACCESS_KEY_ID=<r2-access-key> \
  R2_SECRET_ACCESS_KEY=<r2-secret-key> \
  R2_BUCKET_NAME=unarxiv-audio \
  CALLBACK_SECRET=<same-as-MODAL_WEBHOOK_SECRET>

# Deploy
modal deploy narrate.py
# Copy the web endpoint URL and set it in wrangler.toml as MODAL_FUNCTION_URL
```

## 3. Deploy Worker API

```bash
cd worker
npm install

# Update wrangler.toml:
# - database_id from step 1
# - MODAL_FUNCTION_URL from step 2

wrangler deploy
```

## 4. Deploy Frontend

```bash
cd frontend
npm install

# Update .env.local with your Worker URL
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy out --project-name=unarxiv-frontend
```

## 5. Custom Domain

In Cloudflare dashboard:
1. Go to Pages > unarxiv-frontend > Custom domains
2. Add `unarxiv.org`
3. Cloudflare will auto-configure DNS

## Local Development

### Quick Start

```bash
# First time — installs deps, creates env files, initializes + seeds DB:
./dev.sh setup

# Start both worker API and frontend:
./dev.sh
```

Worker API runs on `http://localhost:8787`, frontend on `http://localhost:3000`.

### What You Get Locally

- **D1 database** — local SQLite via wrangler, seeded with sample papers in various statuses
- **R2 bucket** — local emulation via wrangler (empty, but UI renders correctly without audio files)
- **Admin access** — password is `localdev` (set in `worker/.dev.vars`)
- **No Modal dependency** — narration dispatch is skipped when `MODAL_WEBHOOK_SECRET` is not set to a real secret; papers stay in "narrating" status until manually completed via webhook

### Simulating Narration Completion

Since Modal isn't running locally, simulate a webhook callback to complete a paper:

```bash
curl -X POST http://localhost:8787/api/webhooks/modal \
  -H 'Content-Type: application/json' \
  -d '{"arxiv_id":"2005.14165","status":"narrated","duration_seconds":600,"eta_seconds":0}'
```

### Database Management

```bash
./dev.sh reset   # Wipe local DB and re-seed from scratch
./dev.sh seed    # Re-seed without wiping

# Or directly:
cd worker
npm run db:init       # Create tables (local)
npm run db:seed       # Insert seed data (local)
npm run db:reset      # Wipe + init + seed (local)
npm run db:init:remote  # Create tables on production D1
```

### Environment Files

| File | Purpose | Template |
|------|---------|----------|
| `frontend/.env.local` | Points API to localhost | `frontend/.env.local.example` |
| `worker/.dev.vars` | Local secrets (admin pw, webhook secret) | `worker/.dev.vars.example` |

Both are gitignored. `./dev.sh setup` copies the examples automatically.
