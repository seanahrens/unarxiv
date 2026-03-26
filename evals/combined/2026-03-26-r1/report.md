# Combined Scripter Eval — Round 1 (2026-03-26)

## Cutoff Commits

| Tier | Commit | Date (UTC) | Scope |
|------|--------|-----------|-------|
| **Regex (base)** | `361fff3` | 2026-03-26 14:46:39 | `regex_scripter/` |
| **Hybrid (plus1)** | `569cb05` | 2026-03-26 13:44:32 | `hybrid_scripter/` |
| **LLM (plus1)** | `214fe70` | 2026-03-26 14:08:52 | `llm_scripter.py`, `llm_providers.py`, `figure_utils.py`, `latex_post_process.py` |

---

## Executive Summary

| Tier | Papers | Avg Fidelity | Avg Citations | Avg Header | Avg Figures | Avg TTS | Avg Overall |
|------|--------|-------------|---------------|------------|-------------|---------|-------------|
| **Regex** | 1 | 8.0 | 9.0 | 9.0 | — | 7.0 | 0.81 |
| **Hybrid** | 5 | 8.8 | 7.8 | 9.4 | 8.2 | 8.6 | 0.85 |
| **LLM** | 1 (pre-cutoff) | 4.0 | 3.0 | 7.0 | 2.0 | 5.0 | 0.40 |

**Key findings:**
- **Hybrid** is the strongest tier across all evaluated goals, with particularly clean header compliance and TTS readability.
- **Regex** produces solid, clean output for text-heavy papers but has some math rendering issues and residual artifacts.
- **LLM** (scripter_mode=null, pre-cutoff) shows severe regression: repeated math blocks, citation dropout, and a fabricated LLM refusal message embedded in figure descriptions.

**Note:** No LLM scripts were narrated after the LLM commit cutoff (2026-03-26 14:08:52). Version 313 (paper 2105.05142, created 2026-03-26 13:59:51) was evaluated as the closest available LLM script and is included for reference.

---

## Regex Tier (commit `361fff3`)

### Paper 1 — 2603.17198 (version_id 326)
*"Continual Learning from Abstractions" · LaTeX source · base tier · 36.7KB transcript*

| Goal | Score |
|------|-------|
| Fidelity | 8/10 |
| Citations | 9/10 |
| Header | 9/10 |
| TTS | 7/10 |
| Figures | null |
| **Overall** | **0.81** |

**Notes:** High-fidelity output for a text-heavy continual learning paper. Citations are cleanly stripped. Section headers are natural. The critical error is a hyperparameter truncation (`α = 0.` instead of `α = 0.5`) caused by a math mode parsing failure. A double-comma artifact (`that is,,`) also appears. TTS readability is adequate but dense technical passages with stacked abstractions will be challenging to listen to. Figure removal does not damage surrounding prose.

**Evidence:**
- *Fidelity*: "ER stabilizes training by revisiting past examples. AAT achieves a similar effect using abstracts. By collapsing many entity-specific samples into a shared symbolic template…" — near-verbatim from source, good structure preservation.
- *Artifact*: `"that is,,"` — double comma from `\ie` expansion without deduplication.
- *Math truncation*: `"α = 0."` — should be `"α = 0.5"` (LaTeX `$\alpha = 0.5$` truncated).
- *TTS*: Dense passages like "By collapsing many entity-specific samples into a shared symbolic template, each update reinforces a broader equivalence class of relational patterns" flow awkwardly at speech pace.

---

## Hybrid Tier (commit `569cb05`)

### Paper 1 — 2512.03399 (version_id 325)
*"Co-alignment of AI Systems and Institutions" · LaTeX source · 63.5KB transcript*

| Goal | Score |
|------|-------|
| Fidelity | 9/10 |
| Citations | 8/10 |
| Header | 9/10 |
| TTS | 8/10 |
| Figures | 8/10 |
| **Overall** | **0.85** |

**Notes:** Excellent near-verbatim fidelity with clean citation removal. Figure 1 (full-stack alignment diagram) and comparison table receive accurate, detailed LLM descriptions. One footnote content omission: the co-alignment definition footnote (`"By co-alignment we mean roughly 'align at the same time'"`) was not vocalized. A source-level typo (`"amplifed"`) propagated from LaTeX to transcript.

### Paper 2 — 2301.09976 (version_id 324)
*"Bridging AI Deliberation" · LaTeX source · 98.9KB transcript*

| Goal | Score |
|------|-------|
| Fidelity | 8/10 |
| Citations | 8/10 |
| Header | 9/10 |
| TTS | 8/10 |
| Figures | 7/10 |
| **Overall** | **0.82** |

**Notes:** Strong fidelity and clean structure. Three figures receive good descriptions (engagement comparison, formal metric, misconceptions). However, one figure description includes temporal video UI metadata (`"video is at 12 minutes and 37 seconds"`) which is irrelevant to the paper content. First use of `"mini-publics"` is not expanded despite the source providing a definition.

### Paper 3 — 2404.10636 (version_id 323)
*"Values in Machine Learning" · LaTeX source · 87.0KB transcript*

| Goal | Score |
|------|-------|
| Fidelity | 9/10 |
| Citations | 4/10 |
| Header | 9/10 |
| TTS | 9/10 |
| Figures | 9/10 |

**Overall (computed):** `9*0.35 + 4*0.20 + 9*0.10 + 9*0.15 + 9*0.20 = 0.315 + 0.080 + 0.090 + 0.135 + 0.180 = **0.80**`

**Notes:** This paper has the most critical error across all hybrid evaluations: three instances of `"our approach is inspired by the philosophy of values advanced by, and others"` — the citation keys `\cite{Taylor1977}, \cite{Chang2004}` were stripped but left a dangling preposition, creating grammatically broken sentences. Everything else is excellent: TTS is natural, figures are well described with anatomical detail, headers clean.

### Paper 4 — 2411.09222 (version_id 322)
*"Democratic AI" · LaTeX source · 39.0KB transcript*

| Goal | Score |
|------|-------|
| Fidelity | 9/10 |
| Citations | 10/10 |
| Header | 10/10 |
| TTS | 10/10 |
| Figures | 9/10 |
| **Overall** | **0.95** |

**Notes:** Near-perfect execution. All citations cleanly removed with natural flow. Democracy levels table receives 300+ words of precise description. Header structure flawless. This is a model hybrid narration.

### Paper 5 — 2411.10534 (version_id 320)
*"Chain of Alignment" · LaTeX source · 19.1KB transcript*

| Goal | Score |
|------|-------|
| Fidelity | 9/10 |
| Citations | 9/10 |
| Header | 10/10 |
| TTS | 8/10 |
| Figures | 8/10 |
| **Overall** | **0.89** |

**Notes:** Strong overall. Math articulation converts LaTeX formulas to English well (`r=0.841` → `"Pearson's r equals 0.841"`). Minor issues: `"un. archive dot org"` breaks the domain name unnecessarily (should be `"unarxiv dot org"`), and `"rule-objectives alignment"` from `$\phi_{(r,J)}$` could read more naturally without the hyphen.

---

## LLM Tier (commit `214fe70`, pre-cutoff script)

### Paper 1 — 2105.05142 (version_id 313)
*"Liquid Democracy Game Theory" · LaTeX source · 71.6KB transcript · scripter_mode=null*

| Goal | Score |
|------|-------|
| Fidelity | 4/10 |
| Citations | 3/10 |
| Header | 7/10 |
| TTS | 5/10 |
| Figures | 2/10 |
| **Overall** | **0.40** |

**Notes:** Severe quality failure. Three critical bugs:
1. **Math block repetition**: DISPLAY_MATH_011 through DISPLAY_MATH_018 each appear 5+ times verbatim (lines 200–303). The same lengthy equation strings repeat without any deduplication.
2. **LLM refusal message in output**: Line 52–53 contains `"I cannot provide a detailed description of this figure because no image data is available to analyze..."` — an LLM meta-refusal injected into the narration. This is a fabricated statement that should never appear in production output.
3. **Catastrophic citation dropout**: All ~25 citations stripped with no author-year attribution. The paper's scholarly foundation is invisible to listeners.

Additionally: grammatical error (`"We have introduced general game theoretic model"` — missing article `"a"`), and awkward `"epsilon -Nash equilibrium"` spacing.

---

## Cross-Tier Analysis

### Strongest/Weakest by Goal

| Goal | Best Tier | Worst Tier | Notes |
|------|-----------|-----------|-------|
| Fidelity | Hybrid (8.8 avg) | LLM (4.0) | LLM math repetition catastrophic |
| Citations | Regex (9.0) | LLM (3.0) | Hybrid 4/10 on 2404.10636 is an outlier |
| Header | Hybrid (9.4) | LLM (7.0) | All tiers generally good |
| Figures | Hybrid (8.2) | LLM (2.0) | Regex null (intentional) |
| TTS | Hybrid (8.6) | LLM (5.0) | Regex 7.0 due to math rendering |

### Cost/Quality Tradeoff
- **Regex**: Near-zero marginal cost (no LLM calls), scores 0.81 overall. Best for fast, text-heavy papers.
- **Hybrid**: Modest LLM cost (Haiku-4.5 for figure descriptions only), scores 0.85 overall. Best balance of cost and quality.
- **LLM**: Highest cost (full LLM rewrite), scores 0.40 overall in this eval. Significant quality regression from known-good behavior.

---

## Trend Analysis

### Regex vs. Prior Evals
- r12 (2026-03-26): avg 7.7/10 across 5 papers
- Current r1 combined: regex scores 8.0/10 on 2603.17198
- Consistent with r12 performance; `\ie` double-comma bug noted in r12 still present in `361fff3`

### Hybrid (First Eval)
- Commit `569cb05` represents first formal evaluation of hybrid scripter
- Strong debut: 0.85 overall average across 5 papers
- Main vulnerability: citation trailing-preposition bug (2404.10636 pattern)

### LLM (Most Recent)
- LLM scripter_mode=null at `214fe70` shows severe regression from evals in `evals/llm-scripter/`
- The math repetition and LLM refusal message are new failure modes not seen in prior regex evals
- Recommend not narrating new papers with scripter_mode=null until math repetition bug is fixed

---

## Files in This Directory

| File | Description |
|------|-------------|
| `report.md` | This file |
| `error-catalog-regex.md` | Regex tier errors |
| `error-catalog-hybrid.md` | Hybrid tier errors |
| `error-catalog-llm.md` | LLM tier errors |
| `regex_2603.17198.txt` | Regex transcript |
| `hybrid_2512.03399.txt` | Hybrid transcript |
| `hybrid_2301.09976.txt` | Hybrid transcript |
| `hybrid_2404.10636.txt` | Hybrid transcript |
| `hybrid_2411.09222.txt` | Hybrid transcript |
| `hybrid_2411.10534.txt` | Hybrid transcript |
| `llm_2105.05142.txt` | LLM transcript (pre-cutoff) |
