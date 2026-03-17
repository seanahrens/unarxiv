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

# Create R2 bucket (note: existing deployment uses legacy name "texreader-audio")
wrangler r2 bucket create texreader-audio

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
  R2_BUCKET_NAME=texreader-audio \
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
npx wrangler pages deploy out --project-name=texreader-frontend
```

## 5. Custom Domain

In Cloudflare dashboard:
1. Go to Pages > texreader-frontend > Custom domains
2. Add `unarxiv.org`
3. Cloudflare will auto-configure DNS

## Local Development

```bash
# Terminal 1: Worker API
cd worker && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```
