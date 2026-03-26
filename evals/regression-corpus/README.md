# Regression Corpus

Diverse paper set for scripter regression testing. Established 2026-03-26.

| arxiv_id | tier | title (brief) | why selected |
|----------|------|---------------|--------------|
| 2603.23994 | regex | LLM Optimization Challenges | LaTeX artifact (hspace/vrule), good baseline |
| 2503.05830 | regex | AI-Enhanced Deliberative Democracy | Journal template, header/metadata failure |
| 2311.02242 | regex | Democratic Policy Dev. | Figure ref orphans, author contributions |
| 2602.13920 | regex | Social Network Topology | Math ordinals ($N^{th}$), math-heavy |
| 2312.03893 | regex | Deliberative Tech for Alignment | Section ref orphans (10+ instances) |
| 2211.12434 | hybrid | Expansive Participatory AI | Catastrophic empty-body failure |
| 2302.00672 | hybrid | Generative CI | Functional hybrid, missing date |

## Baseline Scores (pre-fix, from 2026-03-26-r2 eval)

Scores are 0.0–1.0 (divide eval report 1–10 scores by 10).
`compute_overall()` uses canonical weights from `scoring.py`.

### Regex tier (no figures weight)

| arxiv_id | fidelity | citations | header | tts | overall |
|----------|----------|-----------|--------|-----|---------|
| 2603.23994 | 0.8 | 0.7 | 0.9 | 0.7 | 0.7647 |
| 2503.05830 | 0.5 | 0.5 | 0.4 | 0.5 | 0.4882 |
| 2311.02242 | 0.8 | 0.6 | 0.7 | 0.8 | 0.7412 |
| 2602.13920 | 0.8 | 0.7 | 0.9 | 0.7 | 0.7647 |
| 2312.03893 | 0.7 | 0.5 | 0.8 | 0.7 | 0.6646 |

Regex mean overall (baseline): **0.6847**

### Hybrid tier (with figures weight)

| arxiv_id | fidelity | citations | header | figures | tts | overall |
|----------|----------|-----------|--------|---------|-----|---------|
| 2211.12434 | 0.1 | 0.9 | 0.7 | 0.1 | 0.9 | 0.4800 |
| 2302.00672 | 0.8 | 0.7 | 0.6 | 0.7 | 0.8 | 0.7450 |

Hybrid mean overall (baseline): **0.6125**

Combined mean (all 7 papers): **0.6611**

Note: Paper source files (.tar.gz) are fetched from arXiv at eval time.
The corpus is defined by arxiv_id; scores above are from human eval (2026-03-26-r2).
