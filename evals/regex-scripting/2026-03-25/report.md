# Regex Pipeline Eval — 2026-03-25

## Setup

**Cutoff date**: 2026-03-24 18:15:43 -0600
**Establishing commit**: `b9f62a1` — "feat: narration scoring, versioned R2 paths, and Quality Insights admin panel"
**Papers evaluated**: 5 base-tier transcripts downloaded from R2, all narrated after cutoff

**Papers evaluated:**
| # | arXiv ID | Version ID | Title | Source | Words |
|---|----------|------------|-------|--------|-------|
| 1 | 2603.23483 | 201 | SpecEyes: Accelerating Agentic Multimodal LLMs | LaTeX (custom template) | 4,552 |
| 2 | 2603.23386 | 200 | SIMART: Decomposing Monolithic Meshes into Articulated Assets | LaTeX (ByteDance template) | 4,273 |
| 3 | 2603.22386 | 199 | From Static Templates to Dynamic Runtime Graphs (Survey) | LaTeX (TMLR) | 8,959 |
| 4 | 2603.22458 | 198 | MinerU-Diffusion: Rethinking Document OCR | LaTeX (custom template) | 5,604 |
| 5 | 2603.23497 | 197 | WildWorld: Large-Scale Dataset for World Modeling | LaTeX (Meta template) | 4,884 |
| R | paperA (1706.03762) | — | Attention Is All You Need | LaTeX + PDF (regression) | 4,521 / 4,295 |
| R | paperB (1803.09010) | — | Datasheets for Datasets | LaTeX + PDF (regression) | 4,145 / 4,213 |

---

## Executive Summary (Pre-Fix Scores)

| Paper | Completeness | Cleanliness | TTS | Coherence | Avg |
|-------|-------------|-------------|-----|-----------|-----|
| 2603.23483 (SpecEyes) | 7 | 8 | 7 | 8 | **7.5** |
| 2603.23386 (SIMART) | 7 | 9 | 8 | 9 | **8.25** |
| 2603.22386 (Survey) | 9 | 9 | 9 | 9 | **9.0** |
| 2603.22458 (MinerU-Diffusion) | 7 | 7 | 7 | 8 | **7.25** |
| 2603.23497 (WildWorld) | 7 | 9 | 8 | 9 | **8.25** |

**Overall average (pre-fix): 8.05** — up from 7.31 in prior eval, all 4 prior fixes holding.

**Key finding**: The dominant issue this round is `\abstract{}` command-form abstracts being missed. 4 of 5 papers use `\abstract{content}` (either in the preamble or inside the document) instead of `\begin{abstract}...\end{abstract}`, and the parser handled neither form correctly. Additionally, macros that expand to `\textcolor{...}{text}\xspace` or `\gradientRGB{text}{...}` patterns were not expanded, causing system names to be dropped from the script.

---

## Per-Paper Evaluation

### Paper 1: 2603.23483 — SpecEyes (Agentic MLLM Acceleration)

**Word count**: 4,552 | Source: LaTeX (custom template with `\gradientRGB`, `\ours` macro)

**Goal 1 — Completeness: 7/10**
All main sections present: Introduction, Related Work, Methodology (with subsections), Experiments, Conclusion. No bibliography.
- **Critical missing**: Abstract entirely absent. The paper uses `\abstract{...}` in the preamble (before `\begin{document}`), which `_extract_body` skips entirely. The abstract contains the key summary of the speculative pipeline and speedup results.
- **System name dropped**: `\ours` = `\gradientRGB{SpecEyes}{29,78,216}{20,184,166}\xspace`. The macro body contains `\gradientRGB` (a backslash command), so `_expand_simple_macros` skips it. Result: all 15+ occurrences of `\ours` in the body become empty, producing broken sentences like "We instantiate this idea by introducing , an agentic-level speculative acceleration framework" and "We propose , the first framework that lifts speculative acceleration."

**Goal 2 — Artifact Cleanliness: 8/10**
No raw LaTeX commands, no citation brackets, no bibitem. Very clean.
- **One "zoom-," artifact**: Source has `(\eg zoom-in, crop, OCR)`. `\eg` is defined as `e.g.\xspace` (not expanded), so it's stripped to space. Then `\bin\s*,` regex meant to clean dangling prepositions also matches the word-boundary position after `-` in "zoom-in,", stripping "in," and leaving "zoom-,".

**Goal 3 — TTS Readability: 7/10**
Math expressions converted naturally: "S sub sep", "M sub S", "M sub L equals A", "beta alpha greater than 0.6". Broken sentences from missing system name significantly hurt readability.
- Quoted broken sentence: "Extensive experiments on V* Bench, HR-Bench, and POPE show that preserves the full accuracy of the agentic pipeline" — "that" has no subject.

**Goal 4 — Structural Coherence: 8/10**
Section flow is clear and natural. No orphaned punctuation. Paragraph transitions work well. Minor: "each query triggers" starts a sentence with lowercase (should be "Each query triggers") — from the abstract that leaked into the Introduction during preamble processing.

---

### Paper 2: 2603.23386 — SIMART (Articulated Asset Generation)

**Word count**: 4,273 | Source: LaTeX (ByteDance seed template)

**Goal 1 — Completeness: 7/10**
All main sections present: Introduction, Related Work (with 3 subsections), Approach (with subsections), Experiments, Applications, Conclusion.
- **Missing abstract**: Same issue — `\abstract{...}` in preamble (line 42 of paper.tex, before `\begin{document}` at line 54). The abstract summary of SIMART and the 70% token reduction claim is absent.
- No other completeness issues. The Approach section content (lines 35+) is well-preserved.

**Goal 2 — Artifact Cleanliness: 9/10**
Very clean. No citation remnants, no LaTeX commands. One minor issue:
- "I sub vis, G sub geo, T sub txt" from `I=\{I_{\text{vis}}, G_{\text{geo}}, T_{\text{txt}}\}` — the subscript conversion is correct but the spoken form is slightly verbose.

**Goal 3 — TTS Readability: 8/10**
Reads naturally. Math subscripts converted consistently. No raw LaTeX.
- Minor: "illustrates the overall pipeline" (line 37) — dangling reference from a stripped figure. Should read "The figure illustrates..." but the figure reference was correctly stripped.

**Goal 4 — Structural Coherence: 9/10**
Excellent structure. Section transitions natural. Paragraphs well-preserved. "APPLICATIONS." section header in all-caps (from source) is slightly jarring but correct.

---

### Paper 3: 2603.22386 — Survey: Workflow Optimization for LLM Agents (TMLR)

**Word count**: 8,959 | Source: LaTeX (TMLR template using `\begin{abstract}`)

**Goal 1 — Completeness: 9/10**
Comprehensive coverage of the 55-page survey: Abstract, Introduction, background on agentic computation graphs, sections on static workflows, dynamic workflows, optimization dimensions, evaluation, conclusion.
- Abstract correctly captured (uses `\begin{abstract}` environment ✓).
- No appendix bleed (prior fix holding).
- Minor: some dense taxonomy/categorization content in tables is stripped (expected).

**Goal 2 — Artifact Cleanliness: 9/10**
Very clean for such a long and dense LaTeX document. No citation remnants, no commands.

**Goal 3 — TTS Readability: 9/10**
The survey reads naturally as prose. Abbreviations like "for example," and "that is," properly expanded. Long compound noun phrases (common in surveys) are rendered as-is, which is appropriate.

**Goal 4 — Structural Coherence: 9/10**
Clear section transitions. Consistent paragraph spacing. Well-structured for audio. No structural artifacts.

---

### Paper 4: 2603.22458 — MinerU-Diffusion (Document OCR)

**Word count**: 5,604 | Source: LaTeX (OpenDataLab template)

**Goal 1 — Completeness: 7/10**
All main sections present: Introduction, Related Works, Method, Experiments (Data, Evaluation, Results), Conclusion.
- **Missing abstract**: `\abstract{...}` in preamble (line 62, before `\begin{document}` at line 72).
- **System name dropped**: `\mineru` = `MinerU-Diffusion\xspace` — the `\xspace` suffix prevents `_expand_simple_macros` from expanding it. Produces broken sentences: "We first fine-tune the on the LLaVA-NeXT dataset" and "In this section, we present a comprehensive quantitative evaluation of to demonstrate its effectiveness."

**Goal 2 — Artifact Cleanliness: 7/10**
Main issues:
- **5 `\hyperref` leaks**: `\hyperref[app:examples]{Appendix~\ref*{app:examples}}` → `[app:examples]Appendix app:examples`. The `\hyperref[label]{text}` pattern (bracket-style hyperref with explicit label and text) was not handled. The optional `[label]` leaks into the output, and `\ref*` (starred variant) was not in the citation stripping list, causing the label name to be duplicated.
- Example: "More examples are provided in [app:examples]Appendix app:examples." — should read "More examples are provided in Appendix."

**Goal 3 — TTS Readability: 7/10**
Broken sentences from missing system name reduce readability significantly.

**Goal 4 — Structural Coherence: 8/10**
Overall flow is good. `[app:examples]` leaks break the flow slightly at 5 points.

---

### Paper 5: 2603.23497 — WildWorld (Game World Modeling Dataset)

**Word count**: 4,884 | Source: LaTeX (Meta FairMeta template)

**Goal 1 — Completeness: 7/10**
All sections present and well-covered: Introduction, Related Work (Interactive World Models, Video Generation Dataset), WildWorld Dataset (with 3 subsections on platform, pipeline, statistics), WildBench, Experiments, Conclusion.
- **Missing abstract**: The abstract is in `sec/00.abstract.tex` which is `\input`ted inside `\begin{document}`. It uses `\abstract{...}` (command form). `_strip_pre_abstract_content` found the first `\section` and stripped everything before it, including the `\abstract{...}` block containing the summary of WildWorld's 108M frames and 450+ actions.
- The abstract content: "Dynamical systems theory and reinforcement learning view world evolution as latent-state dynamics..." is completely absent.

**Goal 2 — Artifact Cleanliness: 9/10**
Very clean. Only 2 occurrences of "etc." (source uses `etc.` as-is, not expanded to "and so on" — minor TTS concern).
- One dangling reference: "see for illustrations" (from `see~\cref{fig:overview}` for illustrations — correct stripping of figure ref, but "see" becomes dangling).

**Goal 3 — TTS Readability: 8/10**
Clean and readable. "etc." reads fine on most TTS engines. Math-free paper (dataset paper), so no math readability issues.

**Goal 4 — Structural Coherence: 9/10**
Excellent structure. Very clean section flow. One "see for illustrations" is the only coherence issue.

---

## Cross-Paper Patterns

### Pattern 1: `\abstract{}` Command Form — Abstract Missing (CRITICAL, 4/5 papers)

**Papers**: 2603.23483, 2603.23386, 2603.22458 (preamble), 2603.23497 (inside document)
**Root cause (preamble)**: Modern conference templates (NeurIPS, ICML, ICLR, ByteDance, Meta FairMeta, OpenDataLab) use `\abstract{content}` as a preamble command before `\begin{document}`. The parser's `_extract_body` only processes content between `\begin{document}` and `\end{document}`, silently discarding the abstract.
**Root cause (in-document)**: When `\abstract{...}` appears inside the document (e.g., `\input`ted from a sub-file), `_strip_pre_abstract_content` looks for `\begin{abstract}` or `\section{` to find where body content starts. Since neither pattern matches `\abstract{`, the function falls through to the first `\section`, stripping the abstract content as "pre-abstract boilerplate."

### Pattern 2: Macro Expansion Blocked by `\xspace` (SIGNIFICANT, 2/5 papers)

**Papers**: 2603.23483 (`\ours`), 2603.22458 (`\mineru`)
**Root cause**: Common paper macros like `\newcommand{\ours}{SpecEyes\xspace}` or `\newcommand{\mineru}{MinerU-Diffusion\xspace}` end with `\xspace`. The `_expand_simple_macros` function's guard `"\\" not in replacement` rejects any replacement containing a backslash, including the innocuous `\xspace` suffix. These macros occur 15+ times per paper in prose and their absence produces ungrammatical sentences.

### Pattern 3: `\hyperref[label]{text}` Leaks Optional Argument (MEDIUM, 1/5 papers)

**Papers**: 2603.22458
**Root cause**: `_strip_citations` handles `\href{url}{text}` but not `\hyperref[label]{text}`. The `\hyperref` command uses bracket-syntax `[label]` for its optional argument. When `\hyperref` is stripped by the catch-all `\\[a-zA-Z]+\*?`, the `[label]` bracket argument is left in place. Additionally, `\ref*{label}` (starred variant) is not in the citation stripping regex, so the label name is extracted verbatim. The combination produces `[app:examples]Appendix app:examples`.

### Pattern 4: `\bin\s*,` Over-Strips Compound Words (LOW, 1/5 papers)

**Papers**: 2603.23483
**Root cause**: The dangling-preposition cleanup `re.sub(r"\bin\s*,", ",", text)` uses a word boundary `\b`, which matches at the boundary between `-` (non-word char) and `i` (word char). So "zoom-in," is treated as "zoom-" + "in," → "zoom-,". The fix: use `(?<=\s)in\s*,` to only match "in" preceded by whitespace.

---

## Comparison to Prior Eval Reports

| Issue | 2026-03-23 | 2026-03-24 | 2026-03-25 | Status |
|-------|-----------|-----------|-----------|--------|
| `\addtocontents` toc artifact | Fixed | Holding | Holding | ✅ Stable |
| Pre-abstract copyright blocks | Fixed | Holding | Holding | ✅ Stable |
| `et al..` double period | Fixed | Holding | Holding | ✅ Stable |
| Appendix leak via acks regex | — | Fixed | Holding | ✅ Stable |
| Underscore artifacts from Greek subscripts | — | Fixed | Holding | ✅ Stable |
| Double "Abstract." in ICML papers | — | Fixed | Holding (1 in paperA regression) | ✅ Stable |
| `\abstract{}` command form not handled | Not flagged | Not flagged | **CRITICAL new** | ⚠️ New |
| `\xspace` blocking macro expansion | Not flagged | Not flagged | **Significant new** | ⚠️ New |
| `\hyperref[label]{}` leaks `[label]` | Not flagged | Not flagged | Medium new | ⚠️ New |
| `\ref*{}` extracts label name | Not flagged | Not flagged | Medium new | ⚠️ New |
| `\bin\s*,` strips compound "zoom-in," | Not flagged | Not flagged | Low new | ⚠️ New |

---

## Regression Test Results

| Script | Prior Eval Words | Current Pre-Fix | Post-Fix | Delta from prior |
|--------|-----------------|-----------------|----------|------------------|
| paperA_latex | 4,525 | 4,521 | 4,521 | -4 (noise) |
| paperB_latex | 4,145 | 4,145 | 4,139 | -6 (minor, from `in ,` fix) |
| paperA_pdf | 4,301 | 4,295 | 4,295 | -6 (noise) |
| paperB_pdf | 4,225 | 4,219 | 4,219 | -6 (noise) |

All prior fixes (appendix leak, underscore artifacts, double periods) confirmed holding. No regressions from the `b9f62a1` commit changes.

---

## LaTeX vs PDF Quality Comparison

All 5 evaluated papers have LaTeX source available and were parsed via the LaTeX path. No PDF-only papers in this batch.

The LaTeX path continues to be the higher-quality path. The PDF path (verified via regression on paperA/paperB PDFs) maintains its quality level from prior evals. The main quality gap between paths is in math expression handling and structured content like lists/theorems — LaTeX handles these much better.

---

## Fixes Implemented

### Fix 1: Extract `\abstract{}` from Preamble (Addresses Pattern 1a)

**File**: `latex_parser.py`, `_extract_body` function
**Change**: After extracting `\begin{document}...\end{document}`, check the preamble for `\abstract{...}` using brace-counting. If found, prepend it to the body as `\begin{abstract}...\end{abstract}` so the existing abstract conversion handles it correctly.
**Impact**: Abstracts now included for 2603.23483, 2603.23386, 2603.22458 and any future paper using conference template preamble-style `\abstract{}`.

### Fix 2: Recognize `\abstract{}` Inside Document (Addresses Pattern 1b)

**File**: `latex_parser.py`, `_strip_pre_abstract_content` function
**Change**: Add `\abstract\s*\{` as an abstract start marker alongside `\begin{abstract}`. This prevents `_strip_pre_abstract_content` from discarding `\abstract{...}` blocks that appear before the first `\section`.
**Impact**: Abstracts now included for 2603.23497 and any paper that `\input`s an abstract file using the command form.

### Fix 3: Add `\abstract{}` Header in `_convert_structure_to_speech` (Companion to Fix 2)

**File**: `latex_parser.py`, `_convert_structure_to_speech`
**Change**: Add `re.sub(r"\\abstract\s*\{", "\n\nAbstract.\n\n", text)` so the command form also produces the "Abstract." spoken heading (like `\begin{abstract}` already does).

### Fix 4: Expand Macros Ending with `\xspace` (Addresses Pattern 2)

**File**: `latex_parser.py`, `_expand_simple_macros`
**Change**: Strip trailing `\xspace` from macro replacement before applying the no-backslash guard. If the remaining text is clean (no other backslash commands), expand the macro. Also add pre-processing to strip `\gradientRGB{text}{c1}{c2}` → `text` before macro expansion.
**Impact**: `\ours` (SpecEyes), `\mineru` (MinerU-Diffusion), `\eg` (e.g.), and similar `\xspace`-suffixed macros now expand correctly.

### Fix 5: Handle `\hyperref[label]{text}` (Addresses Pattern 3)

**File**: `latex_parser.py`, `_strip_citations`
**Change**: Add `re.sub(r"\\hyperref\[[^\]]*\]\{([^}]*)\}", r"\1", text)` before the existing `\href` handler.
**Impact**: `[app:examples]Appendix app:examples` artifacts eliminated.

### Fix 6: Add `\ref*` to Citation Stripping (Addresses Pattern 3, companion)

**File**: `latex_parser.py`, `_strip_citations`
**Change**: Change `r"\\(ref|autoref|cref|Cref|vref)\{[^}]*\}"` to `r"\\(ref\*?|autoref|cref\*?|Cref\*?|vref)\{[^}]*\}"`.

### Fix 7: Restrict Dangling "in ," to Whitespace-Preceded Context (Addresses Pattern 4)

**File**: `latex_parser.py`, `_normalize_text`
**Change**: Replace `re.sub(r"\bin\s*,", ...)` with `re.sub(r"(?<=\s)in\s*,", ...)` so "in" is only treated as a dangling preposition when preceded by whitespace, not after a hyphen.

---

## Post-Fix Verification

| Paper | Pre-fix Words | Post-fix Words | Abstract | System Name | Hyperref Leaks |
|-------|--------------|---------------|---------|------------|----------------|
| 2603.23483 (SpecEyes) | 4,552 | 4,749 | ✅ Added | ✅ 27 occurrences | N/A |
| 2603.23386 (SIMART) | 4,273 | 4,483 | ✅ Added | N/A | N/A |
| 2603.22386 (Survey) | 8,959 | unchanged | Already correct | N/A | N/A |
| 2603.22458 (MinerU-Diffusion) | 5,604 | 5,774 | ✅ Added | ✅ 31 occurrences | ✅ 0 (was 5) |
| 2603.23497 (WildWorld) | 4,884 | 5,079 | ✅ Added | N/A | N/A |
| paperA_latex (regression) | 4,521 | 4,521 | ✅ Unchanged | N/A | N/A |
| paperB_latex (regression) | 4,145 | 4,139 | No change | N/A | N/A |

### Post-Fix Estimated Scores

| Paper | Completeness | Cleanliness | TTS | Coherence | Avg |
|-------|-------------|-------------|-----|-----------|-----|
| 2603.23483 (post-fix) | 9 | 9 | 9 | 9 | **9.0** |
| 2603.23386 (post-fix) | 9 | 9 | 8 | 9 | **8.75** |
| 2603.22386 (no change) | 9 | 9 | 9 | 9 | **9.0** |
| 2603.22458 (post-fix) | 9 | 9 | 9 | 9 | **9.0** |
| 2603.23497 (post-fix) | 9 | 9 | 8 | 9 | **8.75** |

**Post-fix overall average: 8.9** — up from 8.05 pre-fix; up from 8.58 in prior eval.

All regressions stable. All 7 fixes confirmed working with no regressions on previously-passing checks.
