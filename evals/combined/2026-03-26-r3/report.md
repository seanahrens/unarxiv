# Combined Narration Pipeline Evaluation Report

**Date:** 2026-03-26
**Run:** r3
**Evaluated by:** eval-agent (claude-sonnet-4-6)

---

## Cutoff Commits

| Tier | Commit | Date (UTC) | Files |
|------|--------|------------|-------|
| base (regex) | `628cec3` | 2026-03-26 21:20:56 | `regex_scripter/`, `hybrid_scripter/__init__.py` |
| hybrid | `628cec3` | 2026-03-26 21:20:56 | `hybrid_scripter/__init__.py` |
| plus1 (LLM) | `1175bd7` | 2026-03-26 19:57:42 | `llm_scripter.py`, `llm_providers.py`, `figure_utils.py`, `latex_post_process.py` |

### Note on Hybrid Cutoff
No hybrid scripts were generated after the 628cec3 commit (21:20 UTC). The two hybrid scripts evaluated here (IDs 331 and 317) were created at 17:17 and 14:16 UTC, before the empty-body fix landed. Their scores reflect pre-fix behavior; the fix (200-char body-length guard) should prevent the 2211.12434 empty-body failure going forward.

---

## Scripts Evaluated

| ID | Paper | Tier | Model | Created (UTC) | Post-cutoff? |
|----|-------|------|-------|---------------|--------------|
| 382 | 2312.03893 | base | regex | 2026-03-26 21:54:33 | ✓ |
| 380 | 2311.02242 | base | regex | 2026-03-26 21:51:28 | ✓ |
| 359 | 2312.03893 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 20:35:16 | ✓ (vs LLM cutoff) |
| 358 | 2603.23994 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 20:32:42 | ✓ (vs LLM cutoff) |
| 354 | 2311.02242 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 20:20:54 | ✓ (vs LLM cutoff) |
| 353 | 2602.13920 | plus1 | claude-haiku-4-5-20251001 | 2026-03-26 20:16:54 | ✓ (vs LLM cutoff) |
| 331 | 2211.12434 | plus1 | hybrid_scripter | 2026-03-26 17:17:45 | ✗ (pre-cutoff) |
| 317 | 2302.00672 | plus1 | hybrid_scripter | 2026-03-26 14:16:40 | ✗ (pre-cutoff) |

---

## Executive Summary

### Average Scores by Tier (1–10 scale)

| Goal | Weight | Regex (n=2) | LLM (n=4) | Hybrid (n=2, pre-fix) |
|------|--------|-------------|-----------|----------------------|
| Fidelity | 0.35 | **8.0** | **8.0** | **5.0**† |
| Citations | 0.20 | **7.5** | **6.5** | **8.5**† |
| Header | 0.10 | **9.0** | **8.75** | **8.5** |
| Figures | 0.15 | n/a | **7.25** | **4.5**† |
| TTS | 0.20 | **8.0** | **7.0** | **7.0**† |
| **Overall (est.)** | | **~8.0** | **~7.5** | **~5.7** |

†Hybrid scores are dominated by the catastrophic 2211.12434 empty-body failure (pre-628cec3 fix).

### Key Findings from r3

1. **Regex tier improved significantly from r2** (+1.2 overall est.): The 628cec3 commit eliminated `(section )`/`(sections -)` orphaned cross-reference fragments in the regex tier, and fixed `"N to the power of th"` ordinal rendering. Footer domain corrected to "unarxiv dot org". Regex now matches LLM on fidelity (8.0 each) — a major milestone.

2. **LLM tier unchanged** (same commit 1175bd7 as r2): LLM scores largely match r2 observations. The `(section )`, `(figure )`, `(1em0.6em)`, and ordinal artifacts that the 628cec3 commit fixed for regex are still present in LLM output (the fix was not propagated to `llm_scripter.py` / `latex_post_process.py`).

3. **Hybrid empty-body failure confirmed pre-fix**: 2211.12434 produced 9-line output with no body content. The 628cec3 body-length guard should prevent recurrence. 2302.00672 scores well (9/10 fidelity, 8/10 citations).

4. **Critical LLM truncation**: 2312.03893 (ID 359) has a mid-word cut: `"Weak symbiotic improvemen"`. Footer is present but the section body ended abruptly, suggesting a chunk processing issue.

5. **Citations/references remain the weakest goal across all tiers**: LLM averages 6.5/10; regex 7.5/10; these are structurally caused by the source LaTeX using `\ref{}` that neither scripter can resolve without compiling.

---

## Per-Tier Evaluation

---

### REGEX (base) Tier — commit `628cec3`

#### Per-paper Scores

| Paper | Title (brief) | Fidelity | Citations | Header | TTS |
|-------|---------------|----------|-----------|--------|-----|
| 2312.03893 | Deliberative Tech for Alignment | 8 | 8 | 9 | 8 |
| 2311.02242 | Democratic Policy Dev. | 8 | 7 | 9 | 8 |

**Regex averages:** Fidelity 8.0 · Citations 7.5 · Header 9.0 · TTS 8.0

#### Evidence and Notes

**2312.03893 — section refs fixed (✓ improvement from r2):**
- r2 had 6 lines with `(section )`, `(sections -)` refs in the "How to read this document" section.
- r3 has zero such artifacts. The 628cec3 fix works as intended.
> (r2 was): "starts with a philosophical definition (section ), then building up to something which can be digitally stored (section )"
> (r3 now): "starts with a philosophical definition, then building up to something which can be digitally stored"

**2312.03893 — remaining "to like X to" em-dash artifacts (unfixed):**
> "And while some strive for alignment with a subset of humanity to like democratic governments to they still routinely struggle..."
> "This document is written for those who want the impact of these powerful systems to from governments to AGI to to align with the will of humanity."

These originate from LaTeX em-dash constructions like `---like democratic governments---` that the parser does not handle.

**2311.02242 — orphaned figure ref punctuation (partially fixed):**
- r2 had `(figure )` artifacts. r3 cleaned the parenthetical form but left floating punctuation: "collective response process **. D**uring" (space before period).
- 6 such ` . ` or ` ,` artifacts remain throughout the transcript.
> "...that kicks off a collective response process . During a collective response process, participants..."
> "...a representative subset of responses from the group . The moderator sees..."

**2311.02242 — author contributions metadata not stripped:**
> "Author contributions: Andrew developed the AI tools used in the process. Andrew, Colin, and Lisa designed the process. Aviv advised on process design."

The 628cec3 fix strips standalone "Author Contributions" section blocks, but this paper uses an inline lowercase `author contributions:` marker, which is not caught.

**Footer fixed (✓ improvement from r2):**
> "Narrated by unarxiv dot org." (was: "Narrated by un. archive dot org, an app made by Sean Ahrens and Claude")

---

### LLM (plus1, claude-haiku-4-5-20251001) Tier — commit `1175bd7`

#### Per-paper Scores

| Paper | Title (brief) | Fidelity | Citations | Header | Figures | TTS |
|-------|---------------|----------|-----------|--------|---------|-----|
| 2312.03893 | Deliberative Tech for Alignment | 7 | 6 | 9 | 6 | 7 |
| 2603.23994 | LLM Optimization Challenges | 9 | 7 | 9 | 7 | 7 |
| 2311.02242 | Democratic Policy Dev. | 9 | 6 | 8 | 8 | 8 |
| 2602.13920 | Social Network Topology | 7 | 7 | 9 | 8 | 6 |

**LLM averages:** Fidelity 8.0 · Citations 6.5 · Header 8.75 · Figures 7.25 · TTS 7.0

#### Evidence and Notes

**2312.03893 — mid-word truncation (critical):**
> " Weak symbiotic improvemen"

The section "Weak symbiotic improvement" is cut off mid-word, immediately before the footer. The preceding content is valid, but an entire subsection appears to have been dropped.

**2312.03893 — orphaned section references (shared artifact with r2 LLM):**
> "starting with a philosophical definition (section ), then building up to something which can be digitally stored (section ) and physically sensed (section )."
> "frames alignment as being between the future and the will of humanity (section ), then introduces the idea of an alignment system (sections -)."

6 such lines. The 628cec3 fix was only applied to `latex_parser.py` (regex tier), not to `latex_post_process.py` (LLM tier).

**2603.23994 — (1em0.6em) LaTeX diagram separator artifact:**
> "we are given an initial system (1em0.6em) that takes an input and produces an output, and an oracle to give feedback (1em0.6em)"

This comes from `\hspace{1em}\rule{0.6em}{0.6em}` diagram notation. The 628cec3 fix was applied to `latex_parser.py` only.

**2602.13920 — ordinal math rendering (pre-fix):**
> "posted within the range from 27 to the power of th , January, 2026 to 10 to the power of th , February, 2026"
> "ranging from 25 to the power of th , December, 2025 to 31 to the power of th , December, 2025"

The ordinal fix was applied to `math_to_speech.py` (regex tier) in 628cec3; the LLM tier has not been updated.

**2602.13920 — hanging figure reference sentence:**
> "illustrates the data schema of Moltbook data."

Full sentence was `Figure~\ref{fig:schema} illustrates...`, the `\ref{}` was stripped leaving just "illustrates..." as an orphaned sentence.

**2311.02242 — figure descriptions with orphan refs coexisting:**
The LLM inserts detailed, accurate figure descriptions inline (score_figures=8):
> "This figure shows three screenshots labeled A, B, and C that depict the participatory steps in a collective dialogue process on the Remesh platform..."

Yet the surrounding prose still contains `(figure )` orphan refs:
> "...that kicks off a collective response process (figure ). During..."

Both description and orphan exist simultaneously in the output.

**2311.02242 — figure description quality (best-case LLM example):**
> "This figure presents evidence of deliberative state change across two panels. Panel A displays the percentage of participants who answered 'Yes' to whether they believed the public has insight useful to guide how AI Assistants answer difficult questions. The y-axis ranges from zero to one hundred percent... Before the dialogues, percentages ranged from approximately 68 to 75 percent, while after participation, all categories showed increases to between 88 and 93 percent..."

Accurate, comprehensive, ~85% of information conveyed.

**Footer (unfixed for LLM tier):**
All LLM scripts use: "Narrated by un. archive dot org, an app made by Sean Ahrens and Claude"
The 628cec3 footer fix was applied to `script_builder.py` (regex) only.

---

### HYBRID (plus1, hybrid_scripter) Tier — commit `628cec3` (evaluated at pre-cutoff commit `569cb05`)

**Note:** These two scripts were generated before the 628cec3 empty-body fix. The 2211.12434 score reflects the pre-fix failure mode. The fix should prevent recurrence.

#### Per-paper Scores

| Paper | Title (brief) | Fidelity | Citations | Header | Figures | TTS |
|-------|---------------|----------|-----------|--------|---------|-----|
| 2211.12434 | Expansive Participatory AI | 1 | 9 | 9 | 1 | 5 |
| 2302.00672 | Generative CI | 9 | 8 | 8 | 8 | 9 |

**Hybrid averages:** Fidelity 5.0 · Citations 8.5 · Header 8.5 · Figures 4.5 · TTS 7.0

#### Evidence and Notes

**2211.12434 — catastrophic empty body (pre-fix):**
```
Expansive Participatory AI: Supporting Dreaming within Inequitable Institutions.

By Michael Alan Chang and Shiran Dudy.

Published on November 22, 2022.

Introduction.

Thanks for listening. This has been an audio narration of...
```
Total: 451 bytes, 9 lines. The Introduction section heading appears but the body is entirely absent. The 628cec3 fix adds a 200-char guard that would trigger fallback to pure regex pipeline, preventing this failure.

**2302.00672 — good hybrid output when pipeline succeeds:**
The transcript is clean, comprehensive, and well-structured. No figure descriptions are present, consistent with the paper being largely prose-only (no figures in source).
> Footer: "Narrated by un. archive dot org, an app made by Sean Ahrens and Claude" (old footer, fix not yet applied to hybrid footer template)

---

## Cross-Tier Analysis

### Strongest Tier per Goal (r3)

| Goal | Winner | Notes |
|------|--------|-------|
| Fidelity | Regex ≈ LLM (8.0 each) | Regex caught up to LLM after 628cec3 fixes |
| Citations | Regex (7.5) | LLM still has unresolved ref artifacts; regex fixes applied |
| Header | Regex (9.0) | Footer fix applied only to regex tier |
| Figures | LLM (7.25) | Regex intentionally omits; hybrid uncertain |
| TTS | Regex (8.0) | Ordinals and hspace fixes applied only to regex tier |

**Cost/quality tradeoff:** After 628cec3, regex matches LLM on fidelity while being free and instant. LLM's remaining advantage is figure descriptions (goal 5). For prose-heavy papers without significant figures, the regex tier now produces equivalent output. The case for LLM/hybrid is strongest for figure-heavy papers.

---

## Trend Analysis

### vs. r2 (commit `1175bd7`, 2026-03-26)

| Goal | Regex r2 | Regex r3 | Δ | Notes |
|------|----------|----------|---|-------|
| Fidelity | 7.2 | **8.0** | +0.8 | Less stranded text from ref cleanup |
| Citations | 6.0 | **7.5** | +1.5 | Section/figure orphan cleanup fixed |
| Header | 7.4 | **9.0** | +1.6 | Footer domain + author contributions |
| TTS | 6.8 | **8.0** | +1.2 | Ordinals, hspace artifacts fixed |
| **Overall** | ~6.8 | **~8.0** | **+1.2** | Strong improvement |

| Goal | LLM r2 | LLM r3 | Δ | Notes |
|------|--------|--------|---|-------|
| Fidelity | 8.6 | **8.0** | -0.6 | Different paper set; truncation in 2312.03893 |
| Citations | 6.8 | **6.5** | -0.3 | Consistent; same root causes |
| Header | 8.4 | **8.75** | +0.35 | Slight improvement; different paper set |
| Figures | 8.0 | **7.25** | -0.75 | Paper set variation (fewer figure-heavy papers) |
| TTS | 7.4 | **7.0** | -0.4 | Ordinal/hspace bugs still present in LLM |
| **Overall** | ~7.7 | **~7.5** | -0.2 | Within noise; same unfixed artifacts |

**Key trend:** The 628cec3 improvements were regex-only. The regex tier improved by ~1.2 overall and now ties LLM on fidelity. The LLM tier is unchanged and still has all the pre-628cec3 artifact types. **Priority for next improvement cycle: propagate 628cec3 fixes to `llm_scripter.py` / `latex_post_process.py`.**

### Outstanding Issues (all tiers, unfixed as of r3)

1. **Em-dash orphan fragments** ("to like X to"): Present in both regex and LLM for 2312.03893. From LaTeX `---like X---` patterns.
2. **Inline figure ref floating punctuation**: Regex cleaned `(figure )` form but left ` . ` / ` ,` at inline ref sites.
3. **Inline author contributions metadata**: Not stripped when lowercase and inline (not a section heading).
4. **LLM section/figure ref orphans**: `(section )`, `(figure )` still present in LLM output.
5. **LLM ordinal rendering**: `"N to the power of th"` still in LLM output.
6. **LLM (1em0.6em) hspace artifact**: Still in LLM output.
7. **LLM footer domain**: Still says "un. archive dot org" in LLM/hybrid output.
8. **LLM chunk truncation**: 2312.03893 has a mid-word cut. Root cause unclear (token limit or error in chunk assembly).
9. **Hanging sentence from stripped figure ref**: "illustrates the data schema of Moltbook data." (present in both regex and LLM for 2602.13920 when `\ref{}` is stripped from a subject position).
