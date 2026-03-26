# Combined Narration Pipeline Evaluation Report

**Date:** 2026-03-26
**Run:** r2
**Evaluated by:** eval-agent (claude-sonnet-4-6)

---

## Cutoff Commits

| Tier | Commit | Date (UTC) | Files |
|------|--------|------------|-------|
| base (regex) | `1175bd7` | 2026-03-26 19:57:42 | `regex_scripter/` |
| hybrid | `569cb05` | 2026-03-26 13:44:32 | `hybrid_scripter/` |
| plus1 (LLM) | `1175bd7` | 2026-03-26 19:57:42 | `llm_scripter.py`, `llm_providers.py`, `figure_utils.py`, `latex_post_process.py` |

---

## Scripts Evaluated

| ID | Paper | Tier | Model | Created |
|----|-------|------|-------|---------|
| 356 | 2603.23994 | base | regex | 2026-03-26 20:27:58 |
| 350 | 2503.05830 | base | regex | 2026-03-26 20:14:33 |
| 347 | 2311.02242 | base | regex | 2026-03-26 20:14:09 |
| 346 | 2602.13920 | base | regex | 2026-03-26 20:13:48 |
| 345 | 2312.03893 | base | regex | 2026-03-26 20:13:37 |
| 359 | 2312.03893 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 20:35:16 |
| 358 | 2603.23994 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 20:32:42 |
| 354 | 2311.02242 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 20:20:54 |
| 353 | 2602.13920 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 20:16:54 |
| 334 | 2403.10433 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 17:28:11 |
| 331 | 2211.12434 | plus1 | hybrid_scripter | 2026-03-26 17:17:45 |
| 317 | 2302.00672 | plus1 | hybrid_scripter | 2026-03-26 14:16:40 |

---

## Executive Summary

### Average Scores by Tier (1–10 scale)

| Goal | Weight | Regex (n=5) | LLM (n=5) | Hybrid (n=2) |
|------|--------|-------------|-----------|--------------|
| Fidelity | 0.35 | **7.2** | **8.6** | **4.5** |
| Citations | 0.20 | **6.0** | **6.8** | **8.0**† |
| Header | 0.10 | **7.4** | **8.4** | **6.5** |
| Figures | 0.15 | n/a | **8.0** | **4.0**† |
| TTS Readability | 0.20 | **6.8** | **7.4** | **8.5**† |
| **Overall (est.)** | | **~6.8** | **~7.7** | **~5.6** |

†Hybrid citation/TTS scores are inflated by the empty-body 2211.12434 failure (no content = no artifacts).

**Key takeaway:** LLM tier is the strongest tier (+0.9 over regex, +2.1 over hybrid). All three tiers share the same citation/reference cleanup problems that are the top improvement opportunity. The hybrid scripter has a reliability problem that must be fixed before it can be evaluated fairly.

---

## Per-Tier Evaluation

---

### REGEX (base) Tier — commit `1175bd7`

#### Per-paper Scores

| Paper | Title (brief) | Fidelity | Citations | Header | TTS |
|-------|---------------|----------|-----------|--------|-----|
| 2603.23994 | LLM Optimization Challenges | 8 | 7 | 9 | 7 |
| 2503.05830 | AI-Enhanced Deliberative Democracy | 5 | 5 | 4 | 5 |
| 2311.02242 | Democratic Policy Dev. | 8 | 6 | 7 | 8 |
| 2602.13920 | Social Network Topology | 8 | 7 | 9 | 7 |
| 2312.03893 | Deliberative Tech for Alignment | 7 | 5 | 8 | 7 |

**Regex averages:** Fidelity 7.2 · Citations 6.0 · Header 7.4 · TTS 6.8

#### Representative Evidence

**2503.05830 header failure (score_header=4):**
> (transcript lines 7–21): "Revel and Penigaud (2025)\n\nAI-Enhanced Deliberative Democracy and the Future of the Collective Will\n\nAbstract This article... Authors:\n\nManon Revel1, Meta, FAIR, New York (NYC)... Orcid: 0000-0002-8335-946X. mrevel@mit.edu"

Then lines 23–60: Full table of contents with section numbers.

**2312.03893 orphaned section refs (score_citations=5):**
> "focuses on answering this question; starting with a philosophical definition (section ), then building up to something which can be digitally stored (section ) and physically sensed (section )."

This occurs 10+ times in the "How to read this document" section.

**2602.13920 ordinal math rendering (score_tts=7):**
> "posted within the range from 27 to the power of th , January, 2026 to 10 to the power of th , February, 2026"

Should be: "posted within the range from January 27th, 2026 to February 10th, 2026"

**2311.02242 figure reference orphan (score_citations=6):**
> "kicks off a collective response process (figure )." — 7 such instances

**2603.23994 LaTeX spacing artifact (score_tts=7):**
> "We are given an initial system (1em0.6em) that takes an input and produces an output, and an oracle to give feedback (1em0.6em)"

Should be: those are diagram annotation strings from `\hspace{1em}\vrule\hspace{0.6em}`.

---

### LLM (plus1, claude-haiku-4-5-20251001) Tier — commit `1175bd7`

#### Per-paper Scores

| Paper | Title (brief) | Fidelity | Citations | Header | Figures | TTS |
|-------|---------------|----------|-----------|--------|---------|-----|
| 2312.03893 | Deliberative Tech for Alignment | 8 | 6 | 8 | 8 | 7 |
| 2603.23994 | LLM Optimization Challenges | 9 | 7 | 9 | 8 | 7 |
| 2311.02242 | Democratic Policy Dev. | 8 | 6 | 7 | 8 | 8 |
| 2602.13920 | Social Network Topology | 9 | 7 | 9 | 8 | 7 |
| 2403.10433 | AI-Enhanced Collective Intelligence | 9 | 8 | 9 | 8 | 8 |

**LLM averages:** Fidelity 8.6 · Citations 6.8 · Header 8.4 · Figures 8.0 · TTS 7.4

#### Representative Evidence

**2602.13920 figure description quality (score_figures=8):**
> "The table compares comment network metrics between Moltbook and Reddit across three categories. The first category shows basic network properties: Moltbook has 39,557 nodes and 697,688 edges, while Reddit has 7,854,970 nodes and 51,850,230 edges. The median and average number of neighbors are 8.0 and 17.637 for Moltbook versus 3.0 and 6.390 for Reddit..."

This description accurately conveys the table content at ~80% fidelity.

**2311.02242 figure + orphan coexistence issue (score_citations=6):**
The LLM inserts detailed figure descriptions, yet the surrounding prose still contains 7 `(figure )` orphan references — both description and orphan exist simultaneously.

**2403.10433 best-case LLM output (all scores ≥8):**
Clean prose, comprehensive coverage, no LaTeX artifacts, well-integrated figure descriptions for multilayer network diagrams and tables.

**Shared artifact with regex — 2602.13920 ordinal math (score_tts=7):**
LLM output contains identical "27 to the power of th" string as regex, confirming the artifact originates in source preprocessing before LLM chunking.

---

### HYBRID (plus1, hybrid_scripter) Tier — commit `569cb05`

#### Per-paper Scores

| Paper | Title (brief) | Fidelity | Citations | Header | Figures | TTS |
|-------|---------------|----------|-----------|--------|---------|-----|
| 2211.12434 | Expansive Participatory AI | 1 | 9 | 7 | 1 | 9 |
| 2302.00672 | Generative CI | 8 | 7 | 6 | 7 | 8 |

**Hybrid averages:** Fidelity 4.5 · Citations 8.0 · Header 6.5 · Figures 4.0 · TTS 8.5

#### Representative Evidence

**2211.12434 catastrophic empty body:**
```
Expansive Participatory AI: Supporting Dreaming within Inequitable Institutions.

By Michael Alan Chang and Shiran Dudy.

Published on November 22, 2022.

Introduction.

Thanks for listening. This has been an audio narration of...
```
Total: 9 lines. The Introduction section header appears but no content follows.

**2302.00672 missing date (score_header=6):**
Header: `'Generative CI' through Collective Response Systems.\n\nBy Aviv Ovadya.\n\nMotivation.`
No "Published on [date]." line. Footer also omits date: "Thanks for listening. This has been an audio narration of 'Generative CI'... By Aviv Ovadya. Narrated by..."

**2302.00672 good-quality prose when functional:**
> "Collective response systems are meant to enable groups of arbitrary scale to make generative decisions... They are designed to get as close as possible to one version of the 'democratic ideal'..."

Clean, natural, well-structured. Demonstrates the pipeline's capability.

---

## Cross-Tier Analysis

### Strongest/Weakest by Goal

| Goal | Strongest | Weakest |
|------|-----------|---------|
| Fidelity | LLM (8.6) | Hybrid (4.5)† |
| Citations | Hybrid (8.0)† | Regex (6.0) |
| Header | LLM (8.4) | Hybrid (6.5) |
| Figures | LLM (8.0) | Hybrid (4.0)† |
| TTS | Hybrid (8.5)† | Regex (6.8) |

†Distorted by catastrophic 2211.12434 failure.

### Shared Problems Across All Tiers

These issues appear in **all three tiers** because they originate in shared source processing:

1. **Orphaned cross-reference fragments** — `(figure )`, `(section )`, `summarizes... while compares...` — from `\cref{}`/`\autoref{}` stripping. Present in 4/5 regex papers, 3/5 LLM papers, 1/2 hybrid papers.

2. **Math ordinal artifacts** — `$27^{th}$` → "27 to the power of th" — present in both regex and LLM for 2602.13920.

3. **LaTeX spacing artifact** — `(1em0.6em)` — present in both regex and LLM for 2603.23994.

### Cost/Quality Tradeoff

| Tier | Quality (est.) | Relative Cost | Best For |
|------|---------------|---------------|---------|
| base (regex) | ~6.8 | $0 | High-volume, text-heavy papers |
| plus1 (LLM) | ~7.7 | ~$0.12/paper | Papers with figures/tables |
| hybrid | Unreliable | ~$0.02/paper | Needs reliability fix first |

---

## Trend Analysis

This is the second run for this date (r2). Run r1 (earlier today) used different commits (`361fff3` for regex, `214fe70` for LLM) and evaluated different papers. The r1 results showed hybrid performing strongly (avg 0.85) but that run's LLM had severe regression (avg 0.40 due to a pre-cutoff script with math repetition and refusal text). This run's LLM performs significantly better at ~7.7.

**Cross-run comparison (r1 → r2):**
- Regex: ~8.1 (r1, 1 paper) → ~6.8 (r2, 5 papers) — r1 result likely inflated by small/favorable sample
- Hybrid: ~8.5 (r1, 5 papers) → ~5.6 (r2, 2 papers) — r2 dragged down by empty-body failure
- LLM: ~4.0 (r1, pre-cutoff) → ~7.7 (r2, post-cutoff) — significant improvement after LLM commit changes

---

## Recommendations (Priority Order)

### High Priority

1. **Fix hybrid empty-body failure mode** — Add minimum-length guard: if `len(body.strip()) < 200` after hybrid processing, fall back to regex and log a warning. 2211.12434 produced 9 lines of output for a multi-page paper.

2. **Fix orphaned cross-reference cleanup** — Add patterns to `latex_parser.py` cleanup:
   - `(figure )` → `""` (strip empty parentheses with figure/table/section refs)
   - Sentence fragments starting with stripped citation subjects: detect when sentence starts with a verb without subject after ref removal

3. **Fix journal-format pre-abstract stripping** — Paper 2503.05830 shows the parser fails on journal LaTeX with author blocks containing `\orcid{}`, `\affiliation{}`, and structured TOC. Improve `_strip_pre_abstract()` to detect ORCID and TOC patterns.

### Medium Priority

4. **Fix math ordinal rendering** — `$N^{th}$` → "Nth" (not "N to the power of th"). Add detection in `math_to_speech.py`: if superscript content matches `/^(st|nd|rd|th)$/`, produce ordinal suffix form.

5. **Fix LaTeX diagram annotation passthrough** — `\hspace{1em}\vrule\hspace{0.6em}` produces `(1em0.6em)` artifacts. Add this pattern to the stripping regex.

6. **Fix hybrid missing date** — When `metadata.date` is None, the header/footer omit the date entirely. Use a fallback: extract date from the arXiv ID `YYMM.xxxxx` format.

### Low Priority

7. **Strip "Author contributions:" metadata** — These lines appear after `\begin{abstract}` in some papers and are not stripped (2311.02242).

8. **Improve figure description placement** — Current behavior inserts descriptions at source position; consider inserting at first textual reference point for better narrative flow.
