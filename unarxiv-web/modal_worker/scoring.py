"""
Canonical quality scoring formula for unarXiv narration scripts.

Used by eval agents, the admin API, and the weekly improvement agent.
The formula is defined once here; all consumers import from this module.
"""

# ── Weights ──────────────────────────────────────────────────────────────────
# Fidelity is heaviest: content loss is irreversible and user-visible.
# TTS readability is second: it's what listeners actually hear.
# Artifacts and figures split the middle.
# Header compliance is lowest: narrow, mechanical check.

WEIGHTS = {
    "fidelity": 0.35,
    "citations": 0.20,  # artifact cleanliness (citations, LaTeX remnants)
    "header": 0.10,
    "figures": 0.15,
    "tts": 0.20,
}

# When score_figures is null (regex tier), redistribute its weight
# proportionally across the other four goals.
_WEIGHTS_NO_FIGURES = {
    k: v / (1.0 - WEIGHTS["figures"])
    for k, v in WEIGHTS.items()
    if k != "figures"
}

# Hard floor: if a paper's overall score drops below this after a fix,
# the fix is vetoed regardless of net improvement elsewhere.
OVERALL_FLOOR = 0.65


def compute_overall(
    fidelity: float | None,
    citations: float | None,
    header: float | None,
    figures: float | None,
    tts: float | None,
) -> float | None:
    """Compute the weighted overall score (0.0–1.0).

    If score_figures is None (regex tier), its weight is redistributed.
    Returns None if all inputs are None.
    """
    scores = {
        "fidelity": fidelity,
        "citations": citations,
        "header": header,
        "figures": figures,
        "tts": tts,
    }

    if figures is None:
        weights = _WEIGHTS_NO_FIGURES
    else:
        weights = WEIGHTS

    total_weight = 0.0
    weighted_sum = 0.0
    for key, w in weights.items():
        val = scores.get(key)
        if val is not None:
            weighted_sum += w * val
            total_weight += w

    if total_weight == 0.0:
        return None

    return round(weighted_sum / total_weight, 4)
