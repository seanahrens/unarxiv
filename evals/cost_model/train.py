"""
unarXiv Cost Model Training Script
===================================
Trains linear regression models to predict LLM token counts from paper source
features, then posts updated coefficients to the production Worker API if the
model beats the current proxy formula.

Usage
-----
  python train.py                  # dry run — evaluate only, do not deploy
  python train.py --deploy         # deploy coefficients if ML wins
  python train.py --deploy --force # deploy even if ML doesn't beat proxy

How it works
------------
Cost is definitionally linear: cost = input_tokens * input_price + output_tokens * output_price.
We predict token counts (not dollars) so the model remains accurate if prices change.

Two models are trained per provider:model pair:
  - input_model:  [latex_char_count, figure_count, tar_bytes, script_char_count] → actual_input_tokens
  - output_model: [latex_char_count, figure_count, tar_bytes, script_char_count] → actual_output_tokens

The Worker applies current pricing at estimate time: cost = pred_in * in_price + pred_out * out_price.

The model is deployed (written to D1 via the Worker API) only when:
  1. --deploy flag is passed
  2. sample_count >= MIN_SAMPLES (5)
  3. ML RMSE < proxy RMSE for both input and output (or --force is set)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from typing import Any

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE = os.environ.get("UNARXIV_API_URL", "https://api.unarxiv.org")
ADMIN_PASSWORD = os.environ.get("UNARXIV_ADMIN_PASSWORD", "")
MIN_SAMPLES = 5  # minimum narrations per provider:model before deploying

# Features used for regression (order matters — must match Worker's mlFeatures array)
FEATURE_NAMES = ["latex_char_count", "figure_count", "tar_bytes", "script_char_count"]

# Proxy formula parameters (must match premium.ts estimateCost fallback)
IMAGE_TOKENS_PER_FIGURE = {"openai": 85, "anthropic": 700, "gemini": 550}
PROXY_IMAGE_TOKENS_DEFAULT = 300


# ---------------------------------------------------------------------------
# Data fetching
# ---------------------------------------------------------------------------

def fetch_training_data() -> list[dict[str, Any]]:
    """Fetch training rows from the Worker admin API."""
    import urllib.request

    if not ADMIN_PASSWORD:
        print("ERROR: UNARXIV_ADMIN_PASSWORD env var not set", file=sys.stderr)
        sys.exit(1)

    url = f"{API_BASE}/api/admin/cost-training-data"
    req = urllib.request.Request(
        url,
        headers={
            "X-Admin-Password": ADMIN_PASSWORD,
            "User-Agent": "unarxiv-cost-model/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    rows = data.get("rows", [])
    print(f"Fetched {len(rows)} training rows from {API_BASE}")
    return rows


# ---------------------------------------------------------------------------
# Proxy baseline (mirrors premium.ts estimateCost fallback)
# ---------------------------------------------------------------------------

def proxy_input_tokens(row: dict, provider: str) -> float:
    """Replicate the proxy formula from premium.ts."""
    latex = row.get("latex_char_count") or 0
    figures = row.get("figure_count") or 0
    script = row.get("script_char_count") or 0
    if latex > 0:
        text_tokens = latex / 4
        img_tokens = figures * IMAGE_TOKENS_PER_FIGURE.get(provider.split(":")[0], PROXY_IMAGE_TOKENS_DEFAULT)
        return text_tokens + img_tokens
    # Fallback: 3× output
    return (script / 4) * 3.0


def proxy_output_tokens(row: dict) -> float:
    script = row.get("script_char_count") or 0
    return script / 4


def rmse(predictions: list[float], actuals: list[float]) -> float:
    n = len(predictions)
    if n == 0:
        return float("inf")
    return math.sqrt(sum((p - a) ** 2 for p, a in zip(predictions, actuals)) / n)


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_provider_model(rows: list[dict], provider_model: str) -> dict | None:
    """Train input/output token regressors for one provider:model and return results."""
    try:
        from sklearn.linear_model import LinearRegression
        from sklearn.model_selection import train_test_split
        import numpy as np
    except ImportError:
        print("ERROR: scikit-learn and numpy required. Run: pip install scikit-learn numpy", file=sys.stderr)
        sys.exit(1)

    provider = provider_model.split(":")[0]

    X = np.array([
        [r.get(f) or 0 for f in FEATURE_NAMES]
        for r in rows
    ], dtype=float)
    y_in = np.array([r["actual_input_tokens"] for r in rows], dtype=float)
    y_out = np.array([r["actual_output_tokens"] for r in rows], dtype=float)

    n = len(rows)
    if n < MIN_SAMPLES:
        print(f"  [{provider_model}] Only {n} samples (need {MIN_SAMPLES}) — skipping")
        return None

    # Use all data if too few for a meaningful split; otherwise 80/20
    if n < 10:
        X_train, X_test = X, X
        y_in_train, y_in_test = y_in, y_in
        y_out_train, y_out_test = y_out, y_out
    else:
        X_train, X_test, y_in_train, y_in_test = train_test_split(X, y_in, test_size=0.2, random_state=42)
        _, _, y_out_train, y_out_test = train_test_split(X, y_out, test_size=0.2, random_state=42)

    # Train
    in_model = LinearRegression().fit(X_train, y_in_train)
    out_model = LinearRegression().fit(X_train, y_out_train)

    # Evaluate ML
    in_preds = in_model.predict(X_test).tolist()
    out_preds = out_model.predict(X_test).tolist()
    ml_in_rmse = rmse(in_preds, y_in_test.tolist())
    ml_out_rmse = rmse(out_preds, y_out_test.tolist())

    # Evaluate proxy baseline on same test rows
    test_rows = [rows[i] for i in range(len(rows))]  # all rows when n<10
    if n >= 10:
        # Re-create the same test indices sklearn used (random_state=42)
        indices = list(range(n))
        np.random.seed(42)
        np.random.shuffle(indices)
        split_at = int(n * 0.8)
        test_indices = indices[split_at:]
        test_rows = [rows[i] for i in test_indices]
        y_in_test_list = [rows[i]["actual_input_tokens"] for i in test_indices]
        y_out_test_list = [rows[i]["actual_output_tokens"] for i in test_indices]
    else:
        y_in_test_list = y_in.tolist()
        y_out_test_list = y_out.tolist()

    proxy_in_preds = [proxy_input_tokens(r, provider) for r in test_rows]
    proxy_out_preds = [proxy_output_tokens(r) for r in test_rows]
    proxy_in_rmse = rmse(proxy_in_preds, y_in_test_list)
    proxy_out_rmse = rmse(proxy_out_preds, y_out_test_list)

    print(f"\n  [{provider_model}] n={n}, test_n={len(test_rows)}")
    print(f"    Input  tokens — ML RMSE: {ml_in_rmse:,.0f}  vs  proxy RMSE: {proxy_in_rmse:,.0f}  {'✓ ML wins' if ml_in_rmse < proxy_in_rmse else '✗ proxy wins'}")
    print(f"    Output tokens — ML RMSE: {ml_out_rmse:,.0f}  vs  proxy RMSE: {proxy_out_rmse:,.0f}  {'✓ ML wins' if ml_out_rmse < proxy_out_rmse else '✗ proxy wins'}")
    print(f"    Input  coeffs: {[round(c, 4) for c in in_model.coef_]}  intercept: {in_model.intercept_:.0f}")
    print(f"    Output coeffs: {[round(c, 4) for c in out_model.coef_]}  intercept: {out_model.intercept_:.0f}")

    return {
        "provider_model": provider_model,
        "input_token_coeffs": in_model.coef_.tolist(),
        "input_token_intercept": float(in_model.intercept_),
        "output_token_coeffs": out_model.coef_.tolist(),
        "output_token_intercept": float(out_model.intercept_),
        "input_rmse": ml_in_rmse,
        "output_rmse": ml_out_rmse,
        "proxy_input_rmse": proxy_in_rmse,
        "proxy_output_rmse": proxy_out_rmse,
        "sample_count": n,
        "ml_wins": ml_in_rmse < proxy_in_rmse and ml_out_rmse < proxy_out_rmse,
    }


# ---------------------------------------------------------------------------
# Deployment
# ---------------------------------------------------------------------------

def deploy_coefficients(result: dict) -> None:
    """POST trained coefficients to the Worker API."""
    import urllib.request

    payload = {k: v for k, v in result.items() if k != "ml_wins"}
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{API_BASE}/api/admin/model-coefficients",
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Admin-Password": ADMIN_PASSWORD,
            "User-Agent": "unarxiv-cost-model/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read())
    print(f"  → Deployed: {body}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Train and deploy cost estimation models")
    parser.add_argument("--deploy", action="store_true", help="Deploy coefficients to production")
    parser.add_argument("--force", action="store_true", help="Deploy even if ML doesn't beat proxy")
    args = parser.parse_args()

    print("=" * 60)
    print("unarXiv cost model training")
    print("=" * 60)

    rows = fetch_training_data()
    if not rows:
        print("No training data available yet. Premium narrations will populate it.")
        return

    # Group rows by provider_model
    by_provider: dict[str, list[dict]] = {}
    for row in rows:
        pm = row.get("provider_model")
        if pm:
            by_provider.setdefault(pm, []).append(row)

    print(f"\nProvider:model breakdown:")
    for pm, pm_rows in sorted(by_provider.items()):
        print(f"  {pm}: {len(pm_rows)} rows")

    deployed = []
    skipped = []

    for provider_model, pm_rows in sorted(by_provider.items()):
        result = train_provider_model(pm_rows, provider_model)
        if result is None:
            skipped.append(provider_model)
            continue

        if args.deploy and (result["ml_wins"] or args.force):
            reason = "ML wins" if result["ml_wins"] else "forced"
            print(f"  → Deploying ({reason})...")
            deploy_coefficients(result)
            deployed.append(provider_model)
        elif args.deploy and not result["ml_wins"]:
            print(f"  → Not deploying (proxy still better)")
            skipped.append(provider_model)
        else:
            print(f"  → Dry run — pass --deploy to update production")

    print("\n" + "=" * 60)
    print(f"Summary: {len(deployed)} deployed, {len(skipped)} skipped")
    if deployed:
        print(f"  Deployed: {', '.join(deployed)}")
        print("  The live estimator will now use ML predictions for these models.")
    print("=" * 60)


if __name__ == "__main__":
    main()
