# Security TODO — Infrastructure Exposure Remediation

This file tracks follow-up work from the 2026-03-19 security audits.

---

## Resolved in This Session (2026-03-19)

| Issue | Resolution |
|---|---|
| Modal `trigger_narration` had no auth | Added `Authorization: Bearer {CALLBACK_SECRET}` check in `narrate.py` |
| `callback_url` in trigger_narration had no allowlist | Added allowlist requiring `https://api.unarxiv.org/` prefix |
| Webhook `body.status` not validated against enum | Added explicit allowlist check before `updatePaperStatus` |
| User-supplied paper metadata accepted without length limits | Added 500/5000/200 char/item limits on title/abstract/authors |
| No rate limit on `POST /api/papers` | Added 240/day per-IP limit (configurable via `PAPER_SUBMISSION_DAILY_LIMIT`) |
| Rating `comment` field had no length limit | Truncated to 2000 chars |
| Shell-injection risk in `tex_to_audio.py` ffmpeg calls | Replaced string-interpolated shell calls with `subprocess.run()` list-form |
| Playlist had no size cap | Capped at 500 items |
| Cron ran every minute (unnecessary) | Changed to daily (`0 0 * * *`) |
| D1 database ID committed to public repo | Moved to gitignored `wrangler.production.toml`; CI injects from `D1_DATABASE_ID` secret |

---

## Still Required: One-Time Manual Steps

### 1. Rotate the Modal Function URL (HIGH PRIORITY)

The Modal endpoint URL was public in git history (commits `18dd88b`, `e0a7dfd`, `c927c6f`, `93e2498`).
Although the endpoint now requires auth (fixed above), the old URL is still live until you rotate it.

**Steps:**
1. Redeploy Modal under a new app name to get a new URL:
   ```bash
   # In narrate.py, rename the app temporarily:
   app = modal.App("unarxiv-worker-v2")
   modal deploy narrate.py
   ```
2. Note the new `trigger_narration` URL from Modal's dashboard or deploy output.
3. Update the Worker secret:
   ```bash
   cd unarxiv-web/worker
   echo "https://seanahrens--unarxiv-worker-v2-trigger-narration.modal.run" | npx wrangler secret put MODAL_FUNCTION_URL
   ```
4. Verify narration still works end-to-end.
5. Delete the old Modal app deployment to disable the old URL.

### 2. Add `D1_DATABASE_ID` GitHub Secret

CI now generates `wrangler.production.toml` from the `D1_DATABASE_ID` secret. You need to add it:

1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Add secret `D1_DATABASE_ID` with value `f87529b5-2f6c-43a9-988c-92f41e0a790e`

Until this is done, CI deploys will fail.

### 3. Roll the D1 Database ID (LOW PRIORITY — do when convenient)

The real database ID `f87529b5-...` was public in the repo for some time. While it requires
Cloudflare API auth to exploit (low risk), you should roll it eventually.

**When rolling, implement a clean split:**
- Create a new D1 database: `npx wrangler d1 create unarxiv-db-v2`
- Migrate data if needed (export/import or live migration)
- Update `D1_DATABASE_ID` GitHub secret with the new ID
- Update `wrangler.production.toml` locally (gitignored) with the new ID

### 4. Scrub git history (OPTIONAL)

If you want to remove the old `MODAL_FUNCTION_URL` from git history after rotating:
```bash
# WARNING: rewrites history — coordinate with anyone who has cloned the repo
git filter-repo --path unarxiv-web/worker/wrangler.toml --invert-paths
```
For a public repo where the URL is already rotated and auth-gated, scrubbing is optional.

---

## Local Development Notes

After this change, `wrangler.toml` has a placeholder `database_id` (`00000000-...`). For local dev
this is fine — `wrangler dev` uses a local SQLite file and does not use the remote ID.

If you need to run remote D1 commands locally (e.g. `npm run db:init:remote`), use
`wrangler.production.toml` explicitly:
```bash
npx wrangler d1 execute unarxiv-db --remote --file=../schema.sql --config wrangler.production.toml
```

Your local `wrangler.production.toml` (gitignored) has the real database_id.
