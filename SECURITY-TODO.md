# Security TODO — Infrastructure Exposure Remediation

This file tracks follow-up work for the 2026-03-19 security audit.

## Context

Several infrastructure identifiers were previously committed to `wrangler.toml` in plaintext.
The `MODAL_FUNCTION_URL` has been moved to a Worker secret (no longer in the repo), but the
following values were publicly exposed for an unknown period and should be treated as **compromised**:

| Value | Where exposed | Risk |
|---|---|---|
| `MODAL_FUNCTION_URL` (Modal endpoint) | `wrangler.toml` git history | Anyone could call Modal directly, bypassing the CF Worker's auth |
| D1 database ID `f87529b5-...` | `wrangler.toml` (still present — required by CF binding) | Low on its own; requires CF auth to use |
| R2 bucket name `unarxiv-audio` | `wrangler.toml` (still present) | Low on its own; bucket is not public |

---

## Actions Required in a Future Security Session

### 1. Rotate the Modal Function URL (HIGH PRIORITY)

The Modal endpoint URL was public. Anyone with the URL could call `trigger_narration` directly
(though the function itself doesn't authenticate the caller beyond the URL being secret).

**Steps:**
1. Redeploy the Modal app under a new app name to get a new URL:
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

### 2. Consider Rotating the D1 Database ID (LOW PRIORITY)

The D1 database ID is required in `wrangler.toml` for Cloudflare to bind the DB to the Worker.
It cannot be hidden from the repo without restructuring the deploy pipeline. Options:

**Option A — Accept the risk** (recommended for now):
The database ID alone is useless without Cloudflare API credentials. No action needed.

**Option B — Private wrangler.toml** (for a future hardening pass):
Split `wrangler.toml` into a public base config and a private override:
- Keep `wrangler.toml` with only non-sensitive config (name, main, compat_date, triggers)
- Move D1/R2 bindings to a gitignored `wrangler.production.toml`
- Deploy with: `npx wrangler deploy --config wrangler.production.toml`
- CI/CD would need `wrangler.production.toml` injected as a secret file

### 3. Scrub git history (OPTIONAL)

If you want to fully remove the old `MODAL_FUNCTION_URL` from git history:
```bash
# WARNING: rewrites history — coordinate with anyone who has cloned the repo
git filter-repo --path unarxiv-web/worker/wrangler.toml --invert-paths
# Or more surgical — strip just the line. Requires git-filter-repo installed.
```
For a public repo where the URL is already rotated, scrubbing history is optional since the
old URL will be dead.

### 4. Endpoint Hardening (FUTURE SESSION)

If you later want to add a layer of auth to the Modal endpoint itself (so the URL alone isn't
sufficient), add a shared secret check in `trigger_narration` in `narrate.py`:

```python
@modal.fastapi_endpoint(method="POST")
def trigger_narration(request: dict, authorization: str = Header(None)):
    expected = f"Bearer {os.environ['CALLBACK_SECRET']}"
    if authorization != expected:
        raise HTTPException(status_code=401)
    ...
```

The CF Worker already sends `Authorization: Bearer {MODAL_WEBHOOK_SECRET}` when calling Modal,
so `CALLBACK_SECRET` in the Modal secret could be set to the same value as `MODAL_WEBHOOK_SECRET`.
