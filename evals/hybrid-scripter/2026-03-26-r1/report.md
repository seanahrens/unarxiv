# Hybrid Scripter Evaluation Report — 2026-03-26 r1

## Metadata

| Field | Value |
|-------|-------|
| Cutoff commit | `569cb05` (2026-03-26 07:44:32 -0600 / 13:44:32 UTC) |
| LLM provider | Anthropic |
| LLM model | claude-haiku-4-5-20251001 |
| Narration tier | plus1 |
| Scripter mode | hybrid |
| Prior evals | None (first evaluation round) |

## Papers Evaluated

| # | arXiv ID | Version ID | Title |
|---|----------|-----------|-------|
| 1 | 2512.03399 | 325 | Full-Stack Alignment: Co-Aligning AI and Institutions with Thick Models of Value |
| 2 | 2301.09976 | 324 | Bridging Systems: Open Problems for Countering Destructive Divisiveness across Ranking, Recommenders, and Governance |
| 3 | 2404.10636 | 323 | What are human values, and how do we align AI to them? |

---

## Per-Paper Scores

### Paper 1: 2512.03399 — Full-Stack Alignment

| Goal | Score | Evidence |
|------|-------|----------|
| Near-Verbatim Fidelity | 0.90 | Body text closely matches LaTeX source word-for-word. Section cross-references (`\ref{}`) are stripped to bare text (e.g., "diagnoses the limitations" instead of "Section 2 diagnoses"), leaving 2 instances of "in a later section". Minor smoothing of enumerated lists but content fully preserved. |
| Citation/Footnote Stripping | 1.00 | All `\cite{}` references completely removed with no bracket artifacts. Footnotes stripped cleanly. No residual `[1]` or `(Author, Year)` text found. |
| Header/Footer Compliance | 0.90 | Title appears as first line (programmatic header). Footer sign-off present and correctly formatted. No duplicate headers or intros in the body. |
| Figure/Table Descriptions | 0.90 | 3 figures and 2 tables described with strong detail. Figure 1 (stack comparison): names specific data at each level ("daily active users", "market share"), describes lens metaphors. Table 1: lists all examples across 3 paradigms with specific entries. Table 2 (application areas): describes all 5 applications with failure modes and solutions. Descriptions are thorough enough for ~75%+ comprehension. |
| TTS Formatting | 0.90 | No LaTeX artifacts, no raw commands, no math delimiters. Text reads naturally. Em-dashes converted, bold/italic stripped. Minor: some long compound sentences could benefit from TTS pauses. |
| **Overall** | **0.92** | |

### Paper 2: 2301.09976 — Bridging Systems

| Goal | Score | Evidence |
|------|-------|----------|
| Near-Verbatim Fidelity | 0.90 | Highly faithful to source. Complete preservation of all sections including Background, Signals, Metrics, Discussion. Draft notice from the paper ("This document is a draft") is included — faithful but slightly odd for audio. All enumerated research questions preserved verbatim. |
| Citation/Footnote Stripping | 1.00 | All citations removed cleanly. The word "cite" appears once in "We will cite many of these in the examples" — this is the paper's own text, not a citation artifact. No bracket remnants. |
| Header/Footer Compliance | 0.90 | Authors appear in body line 3 ("By Aviv Ovadya Harvard University and Luke Thorburn King's College London") — this is part of the programmatic header, correctly placed. Footer sign-off correct. |
| Figure/Table Descriptions | 0.90 | 9 figures described in extensive detail. Fig 1 (causal loop): names all pathways and feedback loops. Fig 2 (phone screenshots): describes emoji reactions and ranking differences. Fig 5 (allocation process): describes all stages including engagement/knowledge/harm dimensions. YourView Panorama: describes party positions, scatter plot layout, filtering options. Descriptions enable strong listener comprehension. |
| TTS Formatting | 0.80 | Mostly clean. Math formula "(slot, object, properties)" rendered literally — could be more natural as "a tuple of slot, object, and properties". The formula "R start equals v given that R end is in G superscript plus" is spoken but somewhat hard to follow aurally. The term "k-means" and "PCA" left as acronyms (acceptable). |
| **Overall** | **0.90** | |

### Paper 3: 2404.10636 — What are human values?

| Goal | Score | Evidence |
|------|-------|----------|
| Near-Verbatim Fidelity | 0.80 | Generally faithful but has notable artifacts from reference stripping. 16 instances of "in a later section" replacing `\ref{}` — while individually acceptable, the density makes the audio repetitive and vague. Empty reference artifacts: "(see )" at line 195 (stripped `Figure~\ref{}`), "inspired by, etc." at line 33 (stripped `\cite{Taylor1977}, \cite{Velleman1989}` leaving ", etc."). |
| Citation/Footnote Stripping | 0.70 | Most citations stripped, but artifacts remain: "inspired by, etc." (line 33 — cite tags stripped but comma and "etc." left behind), "(see )" with empty parens (line 195), "described in" with nothing following in some spots. The stripping is incomplete for cases where cite tags are embedded mid-sentence with surrounding punctuation. |
| Header/Footer Compliance | 0.90 | Title and authors correctly in header. Footer sign-off present and correct. No duplicate headers or intros in body. Acknowledgments section included (faithful to paper — acceptable). |
| Figure/Table Descriptions | 0.90 | 8 figures and 2 tables described with excellent detail. Fig 1 (MGE process): describes all 3 steps with specific examples. Values card anatomy: describes all components including CAPs. Moral graph figure: describes network structure, zoomed section with specific vote counts (11 Wiser, 3 Not Wiser, 2 Unsure). Survey charts: describes all 6 Likert scale distributions with percentages. |
| TTS Formatting | 0.90 | Math well-verbalized: "n plus epsilon" for n+ε, percentages spoken out ("89.1 percent"). No LaTeX artifacts. Acronyms (RLHF, CAI, CCAI, MGE) used naturally. The formula "MGE: (S,U) arrow (C,V,E)" is rendered readably. |
| **Overall** | **0.86** | |

---

## Cross-Paper Summary

| Goal | 2512.03399 | 2301.09976 | 2404.10636 | Average |
|------|-----------|-----------|-----------|---------|
| Near-Verbatim Fidelity | 0.90 | 0.90 | 0.80 | 0.87 |
| Citation Stripping | 1.00 | 1.00 | 0.70 | 0.90 |
| Header/Footer | 0.90 | 0.90 | 0.90 | 0.90 |
| Figure/Table Descriptions | 0.90 | 0.90 | 0.90 | 0.90 |
| TTS Formatting | 0.90 | 0.80 | 0.90 | 0.87 |
| **Overall** | **0.92** | **0.90** | **0.86** | **0.89** |

---

## Cross-Paper Patterns

### Strengths
1. **Figure/table descriptions are excellent.** All three papers have rich, detailed descriptions that name specific data points, describe visual layout, and convey meaning. The hybrid approach (regex prose + targeted LLM for complex elements) is working very well here. This is clearly above the base regex scripter's capability.

2. **Citation stripping is mostly excellent.** Papers 1 and 2 achieve perfect citation removal. The regex pipeline handles standard `\cite{}`, `\citep{}`, and `[N]` patterns well.

3. **Near-verbatim fidelity is strong.** The hybrid scripter preserves the paper's prose word-for-word, with only the expected TTS reformatting. No summarization, no paraphrasing, no condensation. This is a key strength of the hybrid approach — the regex pipeline preserves the prose, and the LLM only touches complex elements.

4. **No LaTeX artifacts or Markdown formatting.** Zero instances of raw LaTeX commands, math delimiters, or Markdown bold/italic in any transcript. The post-processing pipeline is robust.

### Issues Found

1. **Citation stripping artifacts in edge cases (Paper 3).** When citations are embedded mid-sentence with surrounding punctuation, the stripping leaves artifacts:
   - `inspired by \cite{Taylor1977}, \cite{Velleman1989}, etc.` → "inspired by, etc." (commas and "etc." orphaned)
   - `(see Figure~\ref{fig:X})` → "(see )" (empty parens)
   - **Root cause:** The regex citation stripper handles the cite tags but doesn't clean up surrounding punctuation (commas before "etc.", empty parentheses).
   - **Severity:** Medium. Noticeable to listeners, sounds like a glitch.

2. **Excessive "in a later section" references (Paper 3).** 16 occurrences of "in a later section" in one paper makes the audio repetitive and vague. The regex pipeline converts `Section~\ref{sec:X}` to "a later section" (or "in a later section"), which is a reasonable default but becomes awkward when a paper has many cross-references.
   - **Root cause:** The `\ref{}` stripping in the regex pipeline replaces all section references with generic text. Papers with heavy cross-referencing (like academic methodology papers) suffer disproportionately.
   - **Severity:** Low-medium. Individually each instance is fine, but the repetition is noticeable.

3. **Math formula readability varies.** Paper 2 has a formal metric formula that's rendered as "the probability that R start equals v given that R end is in G superscript plus, divided by..." — technically correct but hard to follow aurally. The simpler formulas in Paper 3 ("n plus epsilon", "MGE: (S,U) arrow (C,V,E)") work better.
   - **Root cause:** Complex display math is passed to the LLM describer, which does its best but some formulas are inherently hard to verbalize.
   - **Severity:** Low. Most papers have simpler math.

---

## Trend Analysis

This is the first evaluation round (r1). No prior reports exist for comparison.

**Baseline established:** Overall average score of 0.89 exceeds the 0.82 quality bar and comfortably beats the base regex parser's ~0.78 average. The hybrid scripter justifies its cost.

---

## Cost/Quality Assessment

- **LLM model:** claude-haiku-4-5-20251001 ($0.80/$4.00 per 1M tokens)
- **Cost per paper:** Estimated $0.01–0.03 (vs. $0.12+ for full LLM rewrite)
- **Quality:** 0.89 average overall — strong value at ~20% of full LLM cost
- **Recommendation:** Haiku 4.5 is well-suited for this task. No model change needed.

---

## Recommended Changes

### 1. Fix citation stripping edge cases (Priority: Medium)

**Problem:** Orphaned punctuation after citation removal ("inspired by, etc.", "(see )").

**Fix:** Add post-processing rules to the regex pipeline:
- Strip empty parentheses: `(see )` → remove entirely, or `( )` → remove
- Clean orphaned commas before "etc.": `, etc.` when preceded by stripped content → `etc.` or remove
- Strip dangling commas at sentence boundaries

**Location:** `regex_scripter/` citation stripping stage or `latex_post_process.py`

### 2. Reduce "in a later section" repetition (Priority: Low)

**Problem:** Dense cross-referencing papers get 10+ instances of "in a later section".

**Possible fixes:**
- Vary the replacement text: alternate between "in a later section", "as discussed below", "as we will see", "later in this paper"
- Omit the reference entirely when the sentence reads naturally without it (e.g., "We'll motivate these six criteria further" instead of "We'll motivate these six criteria further in a later section")

**Location:** `regex_scripter/` ref-stripping logic

### 3. No model change needed

Haiku 4.5 performs well for figure/table/math descriptions. The figure descriptions are detailed, specific, and capture the key information. No upgrade to Sonnet needed at this time.

---

## Files

- `report.md` — this report
- Scripts and sources available in `/tmp/eval-hybrid/`
