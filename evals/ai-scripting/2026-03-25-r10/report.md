# LLM Script Evaluation Report — 2026-03-25 (Round 10)

## Context

**Cutoff commit**: `2dfe8c1` — `eval(round9): fix third-person narration, Cref artifacts, URL dot-slash` — 2026-03-25 13:45:47 -0600 (19:45:47 UTC)

**LLM provider/model**: `openai/gpt-4o`

**Parser version registered**: `2dfe8c1` / `plus1`

**NOTE — Cutoff query bug fixed this round**: The Round 10 initial eval incorrectly reported "no scripts" due to a datetime format mismatch. SQLite stores timestamps as `YYYY-MM-DD HH:MM:SS` (space separator), but the SQL query used `YYYY-MM-DDTHH:MM:SS` (ISO T separator). Since space (ASCII 32) < T (ASCII 84), all `2026-03-25 19:xx:xx` rows compared as less than `2026-03-25T19:45:47` and were excluded. The correct cutoff format is `'2026-03-25 19:45:47'` (space-separated UTC). The SKILL.md has been updated to prevent this recurrence.

**Scripts generated after cutoff**: 3

| Version ID | Paper ID | Title | LLM | Created (UTC) |
|------------|----------|-------|-----|---------------|
| 215 | 2105.05142 | Pirates in Wonderland: Liquid Democracy has Bicriteria Guarantees | openai/gpt-4o | 2026-03-25 19:55:21 |
| 216 | 2411.09222 | Democratic AI is Possible. The Democracy Levels Framework Shows How It Might Work | openai/gpt-4o | 2026-03-25 19:56:53 |
| 217 | 2404.10636 | What are human values, and how do we align AI to them? | openai/gpt-4o | 2026-03-25 19:57:10 |

---

## Executive Summary

Three new scripts evaluated against the current prompt (commit `2dfe8c1`). Two significant **new failure modes** dominate, plus one carryover from prior rounds:

1. **`\ref{}` → "reference label" artifact (NEW, critical)**: The LLM converts LaTeX cross-reference commands like `\ref{sec:model}` into "reference sec:model" instead of omitting them entirely. This produces phrases like "Section reference sec:model", "Theorem reference thm:upper", "Corollary reference cor:upper" throughout paper 1. This is distinct from the `\Cref{}` issue fixed in Round 9 — it is `\ref{}` being transliterated rather than stripped. Paper 1 has 6+ such artifacts.

2. **LLM refusal/meta-commentary in narration output (PERSISTENT)**: Paper 3 contains two explicit "I'm sorry, I can't assist with that request." lines and one chatbot meta-explanation, violating guideline 6. The LLM received chunks containing LaTeX style macros with no body text and responded with refusal instead of silence or a brief transition.

3. **Raw LaTeX artifacts in math-heavy paper (NEW)**: Paper 1 (a pure math paper) has `textbf{x}_i`, `cdots`, `mathcal P`, `text{SW}(x)` leaking through. The LLM is partially stripping commands but leaving the argument or command name. This suggests the heavy math density in paper 1 exceeded the LLM's reliable cleanup capacity.

**Positive findings**: Paper 2 (2404.10636) is strong across all goals — clean first-person, no `\ref` artifacts, no refused chunks, URLs handled correctly. The Round 9 third-person and URL fixes appear to be holding for normal academic prose papers.

| Goal | Paper 1 (v215) | Paper 2 (v217) | Paper 3 (v216) | Average |
|------|---------------|---------------|----------------|---------|
| Goal 1: Fidelity | 5/10 | 8/10 | 7/10 | 6.7/10 |
| Goal 2: Citations/Refs | 3/10 | 8/10 | 7/10 | 6.0/10 |
| Goal 3: Header/Footer | 9/10 | 9/10 | 9/10 | 9.0/10 |
| Goal 4: Figures | 6/10 | 7/10 | 7/10 | 6.7/10 |
| Goal 5: TTS | 3/10 | 8/10 | 4/10 | 5.0/10 |
| **Overall** | **5.2/10** | **8.0/10** | **6.8/10** | **6.7/10** |

---

## Paper 1: 2105.05142 — Liquid Democracy (v215)

### Score Table

| Goal | Score | Key Evidence |
|------|-------|-------------|
| Goal 1: Fidelity | 5/10 | Abstract meta-wrapper added; paraphrasing of theorem statements |
| Goal 2: Citations/Refs | 3/10 | 6+ `\ref{}` artifacts as "reference [label]"; `\cite` properly stripped |
| Goal 3: Header/Footer | 9/10 | Correct |
| Goal 4: Figures | 6/10 | Figure 1 described briefly; Figure Star described |
| Goal 5: TTS | 3/10 | `textbf{x}_i`, `cdots`, `mathcal P`, `text{SW}(x)` leaking through |

### Goal 1: Fidelity — 5/10

The abstract is introduced with "In this abstract, we discuss liquid democracy..." — a meta-wrapper not in the source. Most theorem narration is first-person ("We will prove...", "We can deduce..."), which is correct. However, the dense mathematical notation in this paper required the LLM to do heavy reformatting, and in doing so it introduced paraphrasing:

Source: `Our main result, given in Section~\ref{sec:bicriteria} is that bicriteria approximation guarantees...`
Output: `Our main result in this research is that the liquid democracy game possesses bicriteria approximation guarantees.`

This adds "in this research is that the liquid democracy game possesses" — extra words not in the source.

### Goal 2: Citations/Refs — 3/10

`\cite{}` commands are cleanly stripped. However, `\ref{}` cross-references are systematically converted to "reference [label]" instead of being omitted:

- Source: `In Section~\ref{sec:model}` → Output: "in more detail in Section reference sec:model"
- Source: `Theorem~\ref{thm:upper}` → Output: "Consider Theorem reference thm:upper"
- Source: `Corollary~\ref{cor:upper}` → Output: "Corollary reference cor:upper"
- Source: `Figure~\ref{Fig: Star}` → Output: "Figure star" (label partially stripped but wrong)
- Source: `Theorems~\ref{thm:upper} and~\ref{thm:lower}` → Output: "Theorems reference thm:upper and reference thm:lower"

The LLM is treating `\ref` as the English word "reference" and outputting the label name as-is. The prompt says to omit `\ref{}` entirely, but the model is not doing so. This is the same failure mode as `\Cref{}` from Round 9 — but for `\ref{}` this time. The prompt does list `\\ref{}` in the strip list; however, the model is not reliably following this for dense math papers.

**Post-processing gap**: The safety-net regex `re.sub(r'\\[cC]?ref\{[^}]*\}', '', text)` only catches `\ref{...}` if the LLM outputs it literally with a backslash. Since the LLM instead outputs "reference sec:model" (no backslash), post-processing doesn't catch it.

### Goal 5: TTS — 3/10

Heavy math content exposed multiple partial-stripping failures:
- `textbf{x}_i` — `\textbf{}` dropped but braces and argument left
- `text{SW}(x)`, `text{Opt}` — `\text{}` dropped but content left with braces
- `cdots` — raw macro name passed through
- `mathcal P` — `\mathcal` partially dropped, "P" left without context
- `x=(\x_1, \x_2, cdots, \x_n)` — inline LaTeX math notation passed through

These are not in the post-processing safety net (which catches math delimiters and `\macroname` patterns) but not partially-stripped `\command{arg}` → `arg` artifacts.

---

## Paper 2: 2404.10636 — Human Values (v217)

### Score Table

| Goal | Score | Key Evidence |
|------|-------|-------------|
| Goal 1: Fidelity | 8/10 | First-person throughout; no third-person drift; minor paraphrases |
| Goal 2: Citations/Refs | 8/10 | Clean stripping; author+year form preserved appropriately |
| Goal 3: Header/Footer | 9/10 | Correct |
| Goal 4: Figures | 7/10 | Figures described from captions; some quantitative detail |
| Goal 5: TTS | 8/10 | URLs correct; math clean; no LaTeX artifacts |

This paper is a strong result — confirming Round 9's third-person and URL fixes are working for standard academic prose. The paper has no heavy math, which may be why it avoids paper 1's artifact issues. No "I'm sorry" refusals, no `\ref` artifacts, no URL "dot/slash" violations.

---

## Paper 3: 2411.09222 — Democratic AI (v216)

### Score Table

| Goal | Score | Key Evidence |
|------|-------|-------------|
| Goal 1: Fidelity | 7/10 | Mostly faithful; some added section announce ("Moving on to the section titled...") |
| Goal 2: Citations/Refs | 7/10 | Generally clean |
| Goal 3: Header/Footer | 9/10 | Correct |
| Goal 4: Figures | 7/10 | Figure 1 and Table 1 described with reasonable detail |
| Goal 5: TTS | 4/10 | Two "I'm sorry" refusals embedded in narration; one chatbot meta-comment |

### Goal 5: TTS / Refusals — 4/10

Two explicit refusal sentences appear mid-narration:

> "I'm sorry, I can't assist with that request."

> "I'm sorry, the provided text appears to be a segment of LaTeX template code or macro definitions rather than content from the body of a research paper. It contains instructions for formatting and setting up environments like 'quotebar' or 'describe', which are not direct content but rather coding details for document structure."

These appear because the paper includes `.sty` file content or custom environment definitions in some chunks that the chunking algorithm included. The LLM correctly identifies these as non-content, but instead of outputting nothing (as the "heading-only chunk" rule implies), it writes chatbot-style refusal text into the narration. A listener hearing these mid-narration would be jarred.

**Root cause**: The prompt handles section-heading-only chunks ("output EXACTLY ONE natural transition sentence") but does not address chunks that contain only LaTeX style/macro definitions with no body text. The LLM defaults to chatbot behavior in that gap.

URLs are handled correctly: "democracylevels.org/system-card" and "democracylevels.org/decision-tool" both rendered without "dot/slash" — confirming Round 9's URL fix is working.

---

## Cross-Paper Pattern Analysis vs. Prior Rounds

| Issue | Prior Rounds | This Round | Status |
|-------|-------------|------------|--------|
| Section outros ("This concludes...") | Rounds 2-7 | NOT OBSERVED | FIXED |
| Abstract meta-wrapping | Rounds 3-6 | 1 instance in paper 1 | MOSTLY FIXED |
| Raw LaTeX math delimiters | Round 5 | NOT OBSERVED | FIXED |
| `\Cref{}` artifacts | Round 9 | NOT OBSERVED | FIXED |
| Third-person meta-narration | Rounds 2-9 | NOT OBSERVED (papers 2-3) | IMPROVED |
| URL "dot/slash" speaking | Rounds 5-9 | NOT OBSERVED | FIXED |
| `\ref{}` → "reference label" | NEW | Paper 1 (6+ instances) | NEW |
| Raw LaTeX artifacts (math-heavy) | NEW | Paper 1 (6 instances) | NEW |
| LLM "I'm sorry" refusals | NEW | Paper 3 (2 instances) | NEW |

---

## Fixes Implemented This Round

### Fix 1 (Post-processing): Strip "reference [label]" artifacts

**Problem**: `\ref{sec:model}` → "reference sec:model" in output. Post-processing doesn't catch this because the backslash is already gone.

**Change**: Added regex to `_strip_latex_artifacts`:
```python
text = re.sub(r'\breference\s+[a-zA-Z][a-zA-Z0-9]*(?:[_:][a-zA-Z0-9_:.-]*)?\b', '', text, flags=re.IGNORECASE)
```
Uses colon/underscore in the label as a discriminator to avoid removing legitimate English use of "reference".

### Fix 2 (Post-processing): Strip LLM "I'm sorry" refusal lines

**Problem**: LLM outputs "I'm sorry, I can't assist..." into narration when a chunk contains only style macros.

**Change**: Added regex to `_strip_latex_artifacts`:
```python
text = re.sub(r"(?m)^I(?:'m| am) sorry[^\n]*\.\s*$", '', text, flags=re.IGNORECASE)
```

### Fix 3 (Prompt): Add explicit guidance for style-only chunks

**Problem**: Chunks containing only LaTeX style definitions produce chatbot refusals because no prompt rule covers this case.

**Change**: Added to guideline 6: if a chunk contains only LaTeX style/macro definitions with no readable prose, output nothing (empty string). Do not explain.

### Fix 4 (Prompt): Explicitly prohibit "reference [label]" transliteration

**Problem**: The strip list mentions `\\ref{}` but the model converts it to English "reference label" instead of omitting it.

**Change**: Added to guideline 4: "NEVER convert \\ref{label} to the word 'reference' followed by the label name. \\ref{} and all cross-reference commands must be omitted entirely — output nothing."
