# Regex Parser Eval — Round 13 (2026-03-26)

## Summary

| | |
|---|---|
| **Parser commit** | `27984b6` (2026-03-26 03:06 CST) |
| **Prior commit (r12 base)** | `c3beefc` |
| **Eval date** | 2026-03-26 |
| **Papers evaluated** | 4 (all LaTeX source, all post-cutoff) |
| **Avg score** | 6.75/10 |
| **Critical bugs found** | 4 (`^\circ` → wrong, `\!` leak, empty formatted macros, TeX-unit artifacts) |

**Changes in `27984b6` vs `c3beefc`**: Fixed `\newcolumntype` artifact, `\captionsetup` optional-arg leak, subscript 5-pass limit → 20, orphaned verb cleanup.

---

## Per-Paper Results

### Paper 1 — 2603.24440 (CUA-Suite: Massive Human-annotated Video Demonstrations for Computer-Use Agents)
*LaTeX source · version_id 306 · 3874 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 7/10 |
| Artifact Cleanliness | 6/10 |
| TTS Readability | 6/10 |
| Structural Coherence | 7/10 |
| **Overall** | **6.5/10** |

**Notes:** Paper uses heavily macro-decorated product/dataset names. The `_expand_simple_macros` function only expands zero-argument macros whose bodies are plain text. Macros like `\newcommand{\cuasuite}{\textbf{CUA-Suite}\xspace}` are excluded because the body contains `\textbf{...}`, leaving the name silently empty throughout the script.

**Issue 1 (critical — same as r12 GameplayQA): Empty formatted macro names**
- `"we introduce , a large-scale ecosystem"` — product name silently dropped
- `"At its core is , which provides approximately 10,000"` — same
- `" further provides two complementary resources: , a rigorous benchmark"` — same
These blank slots appear ~10 times across the abstract and all major sections. When spoken, the listener has no idea what the paper is introducing.

**Issue 2: TeX spacing artifacts on own lines**
- Line 28: `, -2ex,` — standalone artifact from column spec or spacing macro residue
- Lines 44, 53, 60: ` ,-1.5ex.` — same pattern

These appear at section boundaries where `\vspace{-1.5ex}` or column specs from `\begin{tabular}{@{\hspace{-1.5ex}}...}` were partially stripped: `\begin{tabular}` was removed but the `{...}` argument containing the spacing value was left behind, then braces were stripped leaving the raw value.

---

### Paper 2 — 2603.21618 (4DGS360: 360° Gaussian Reconstruction of Dynamic Objects from a Single Video)
*LaTeX source · version_id 303 · 3898 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 8/10 |
| Artifact Cleanliness | 6/10 |
| TTS Readability | 5/10 |
| Structural Coherence | 7/10 |
| **Overall** | **6.5/10** |

**Notes:** Math-heavy computer vision paper. Greek letter conversion (mu, Sigma, etc.) works well. Complex trajectory math is rendered reasonably.

**Issue 3 (critical): `$360^{\circ}$` → "360 to the power of" instead of "360 degrees"**

The degree symbol appears **8 times** in this paper (paper name, abstract, intro, datasets section). Root cause:
- `$360^{\circ}$` reaches `_convert_superscripts` with braced content `\circ`
- `_SUPERSCRIPT_WORDS` does not contain `\circ`
- Falls to fallback: `f" to the power of {content}"` = `" to the power of \\circ"`
- Then `\\circ` → removed by `re.sub(r"\\[a-zA-Z]+", " ", expr)`
- Result: "360 to the power of " (trailing space)

The paper title includes "360°" and the abstract's first sentence says "360 to the power of dynamic object reconstruction" which is nonsensical to a listener.

Example instances:
- `"We introduce 4DGS360, a diffusion-free framework for 360 to the power of dynamic object reconstruction"`
- `"enabling consistent 360^ reconstruction"` (bare version)
- `"test cameras are placed up to 135 to the power of apart from training views"`

**Minor: empty lines from display math**
Lines 126, 132 are blank lines left after equations are stripped. These don't break coherence but slightly impact rhythm.

---

### Paper 3 — 2603.22529 (Ego2Web: A Web Agent Benchmark Grounded in Egocentric Videos)
*LaTeX source · version_id 305 · 3987 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 6/10 |
| Artifact Cleanliness | 7/10 |
| TTS Readability | 7/10 |
| Structural Coherence | 7/10 |
| **Overall** | **6.75/10** |

**Notes:** Generally clean output with good citation stripping. Complex math formulas (V sub meta etc.) are acceptable.

**Issue 4: Missing abstract**
The script begins directly with "Introduction." — no abstract. The paper likely uses a non-standard abstract format (e.g., `\abstract{...}` command in preamble, or a conference-specific environment like `\begin{techsummary}` or plain text placed before `\section{Introduction}`). Without seeing the source, cannot confirm exact cause, but the `_extract_body` and `_strip_pre_abstract_content` pipeline did not find or preserve the abstract.

**Issue 5 (minor): Section title with leading colon artifact**
- Line 31: `": From Video Perception to Web Reasoning and Actions."` — starts with a colon, indicating that a preceding macro like `\task` expanded to empty. The section was `\section{\task: From Video Perception...}` where `\task` is a formatted system name.

This is a symptom of the same "empty formatted macro" issue as Paper 1 (Issue 1).

---

### Paper 4 — 2603.24157 (CarePilot: A Multi-Agent Framework for Long-Horizon Computer Task Automation in Healthcare)
*LaTeX source · version_id 304 · 4490 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 8/10 |
| Artifact Cleanliness | 7/10 |
| TTS Readability | 7/10 |
| Structural Coherence | 7/10 |
| **Overall** | **7.25/10** |

**Notes:** Well-structured paper with good coverage. The actor-critic framework description is narrated clearly.

**Issue 6 (critical): `\!` (LaTeX negative thin space) leaking as `!` characters**

In math mode, `\!` is used for negative thin spacing to tighten formulas: `T\!\in\!A` (no space around ∈). In the pipeline:
1. `\!` is not stripped by `_normalize_text`'s `re.sub(r"\\[a-zA-Z]+\*?", " ", text)` because `!` is not alphabetic
2. The backslash is removed by `text.replace("\\", "")` but the `!` remains

Instances:
- `"T! in [t sub low,t sub high]"` — from `T\!\in\![t_{\text{low}},t_{\text{high}}]`
- `"(t!-!1)"` — from `(t\!-\!1)` tight spacing in subscripts
- `"a sub t! in ! A"` — from `a_t\!\in\!A`
- `"(t!+!1)"` — similar pattern

These `!` characters are TTS artifacts (they'll be read as "exclamation mark" by some TTS engines, or cause sentence boundary detection to trigger mid-formula).

**Issue 7 (source, not parser): Duplicate "Training Strategy." section**
The paper contains two subsections both titled "Training Strategy." The first (lines 99–103) contains a brief version; the second (lines 105–110) contains the full version. This is a source-level issue (the paper authors may have had duplicate content in their LaTeX). The parser correctly includes both, as both are present in the original LaTeX. Not a parser bug.

**Minor: Implementation details section uses "GPUs" formulation**
- `"(2 10)"` — from `$2 \times 10^{-4}$` (learning rate). Math conversion loses the exponent: `2 times 10 to the power of minus 4` would be better but falls outside the complexity threshold (result is "2 times 10"). Acceptable given complexity threshold.

---

## LaTeX vs PDF Comparison

Only LaTeX papers were available in this eval window. PDF comparison deferred. Based on prior evals, the LaTeX path remains higher quality. The regression test word counts are stable (within ±5% of prior run), confirming r12 fixes did not introduce regressions.

---

## Cross-Paper Patterns

| Issue | Papers | r12 status |
|---|---|---|
| Empty formatted macro names (`\textbf{Name}` → empty) | 2603.24440, 2603.22529 | Noted in GameplayQA r12, **not fixed** |
| `^\circ` → "to the power of" instead of "degrees" | 2603.21618 | **New** |
| `\!` leaking as `!` | 2603.24157 | **New** |
| TeX spacing unit artifacts (`, -2ex,`) | 2603.24440 | **New** |
| Missing abstract | 2603.22529 | **New** (source may not have standard abstract env) |

---

## Regression Test Results

| Paper | Prior words | Current words | Δ | Regression? |
|---|---|---|---|---|
| paperA LaTeX | 4402 | 4517 | +115 | No — expected increase from better macro handling |
| paperB LaTeX | 4183 | 4139 | -44 | No — within normal variance |
| paperA PDF | 4422 | 4289 | -133 | No — orphaned fragment cleanup from r12 |
| paperB PDF | 4290 | 4305 | +15 | No |

All regression papers still begin with the expected headers and abstract text. No new artifacts detected in regression outputs.

---

## Recommended Fixes (Implemented This Run)

### Fix 1: `^\circ` → "degrees" in math_to_speech.py
Add `"\\circ": " degrees"` to `_SUPERSCRIPT_WORDS`. This handles `$360^{\circ}$` → "360 degrees".

### Fix 2: `\!` (negative thin space) cleanup in latex_parser.py
In `_normalize_text`, add `text = re.sub(r"\\!", "", text)` before the bare backslash removal to silently discard the LaTeX negative thin space character.

### Fix 3: Formatted macro expansion in latex_parser.py
In `_expand_simple_macros`, after checking plain text expansion, try stripping inline formatting wrappers (`\textbf{}`, `\textit{}`, etc.) to extract plain text from macro bodies. This recovers names like `\newcommand{\ours}{\textbf{SomeName}\xspace}` → "SomeName".

### Fix 4: TeX unit artifact cleanup in script_builder.py
In `finalize_body`, add a regex to strip lines that consist only of TeX length/spacing values (e.g., `, -2ex,` or `,-1.5ex.`).
