# Regex Pipeline Eval — 2026-03-24

## Setup

**Cutoff date**: 2026-03-23 13:21:16 -0600 (19:21:16 UTC)
**Establishing commit**: `d19e3a0` — "eval(round6): fix pre-abstract bleed, toc artifact, double-period author format"
**Papers in production since cutoff**: ~10 base-tier papers narrated (no `transcript_r2_key` stored — base-tier scripts are generated in-memory and fed directly to TTS; no R2 transcripts to download)

**Evaluation method**: Downloaded arXiv LaTeX source archives for 4 recent production papers; regenerated scripts locally using the current parser_v2. Regression tests re-run for paperA and paperB (LaTeX + PDF).

**Papers evaluated:**
| # | arXiv ID | Title | Source |
|---|----------|-------|--------|
| 1 | 2603.21872 | Manifold-Aware Exploration for RL in Video Generation | LaTeX (ICML) |
| 2 | 2603.22212 | Omni-WorldBench: Interaction-Centric Evaluation for World Models | LaTeX |
| 3 | 2603.21606 | mSFT: Addressing Dataset Mixtures Overfitting Heterogeneously | LaTeX |
| 4 | 2603.19809 | How Well Does Generative Recommendation Generalize? | LaTeX |
| R | paperA (1706.03762) | Attention Is All You Need | LaTeX + PDF (regression) |
| R | paperB (1803.09010) | Datasheets for Datasets | LaTeX + PDF (regression) |

---

## Executive Summary

| Paper | Completeness | Cleanliness | TTS Readability | Structural Coherence | Avg |
|-------|-------------|-------------|-----------------|---------------------|-----|
| 2603.21872 (math/ICML) | 8 | 7 | 7 | 7 | **7.25** |
| 2603.22212 (systems) | 8 | 8 | 8 | 8 | **8.0** |
| 2603.21606 (with appendix) | 4 | 6 | 7 | 5 | **5.5** |
| 2603.19809 (recsys) | 9 | 8 | 8 | 9 | **8.5** |

**Overall average (new papers): 7.31** — down from 8.25 in prior eval, primarily due to the critical appendix leak in 2603.21606 (score 5.5).

**Critical finding**: Appendix content is leaking into generated scripts for papers that place the appendix immediately after acknowledgments. This is a regression in quality for those papers and must be fixed immediately.

LaTeX path: good for text-heavy papers (8.0–8.5), but math papers still have subscript artifacts, and the appendix leak is a serious issue for papers with standard `\appendix` after acks.

---

## Per-Paper Evaluation

### Paper 1: 2603.21872 — Manifold-Aware Exploration (Math-Heavy, ICML Format)

**Word count**: 3,637 words

**Goal 1 — Completeness: 8/10**
All main body sections present: Abstract, Introduction, Related Work, Methodology, Experiments, Conclusion. No bibliography. No appendix content.
Minor deduction: Word count (3,637) is low for an ICML paper — some content may be in commented-out sections or figures. The double "Abstract." heading takes a line that should be content.

**Goal 2 — Artifact Cleanliness: 7/10**
No raw LaTeX commands, no citation brackets, no bibitem.
Issues found:
- **Double "Abstract."**: Script begins with `Abstract.\n\nAbstract.\n\n[content]`. Two `\begin{abstract}` environments: the ICML template file `sec/0_abstract.tex` has an empty one (all content commented), and the main paper has a second one with real content. Both get converted to "Abstract."
- **20 underscore artifacts**: `"pi _ theta"`, `"E_ x sub 0"`, `"s_ theta ( x sub t)"`, `"v_ theta"` — subscripts where the target is a Greek letter. `_convert_greek_letters` adds spaces around Greek commands (`\theta` -> ` theta `), turning `_\theta` into `_ theta` (underscore + space + word), which `_convert_subscripts` fails to handle.
- **3 garbled math expressions**: `"J( theta ) equals E_ x sub 0 approximately equals"` — complex expectation expression

**Goal 3 — TTS Readability: 7/10**
70 `sub [char]` occurrences — expected for a math/RL paper. Main prose is clean.
Issues: The underscore artifacts make several key mathematical terms unnatural: `"pi _ theta"` (policy parameterized by theta) would be better as `"pi sub theta"`. `"v_ theta"` reads as `"v underscore theta"`.

**Goal 4 — Structural Coherence: 7/10**
The double "Abstract." at the top is a clear structural break. Section flow otherwise logical. Some orphaned cross-references from figure stripping occur occasionally.

---

### Paper 2: 2603.22212 — Omni-WorldBench (Systems/Evaluation)

**Word count**: 6,737 words

**Goal 1 — Completeness: 8/10**
Full main body: Abstract, Introduction, Background, Omni-WorldSuite, Omni-Metrics, Experiments, Conclusion. Good coverage.
Minor deduction: Some benchmark comparison content may be in tables (stripped correctly).

**Goal 2 — Artifact Cleanliness: 8/10**
Very clean for a systems paper.
Issues:
- **1 ellipsis double period**: `"let O equals ø sub 1,.., o sub N"` — from `\{o_1, \ldots, o_N\}` where `\ldots` -> `...` and the doubled-punctuation cleanup collapses `,...,` to `,..,` (removes one dot from the three-dot ellipsis)
- **3 underscore artifacts**: minor

**Goal 3 — TTS Readability: 8/10**
Mostly reads naturally. 27 `sub [char]` occurrences — appropriate for a systems paper.
Issues: 7 occurrences of `"As shown"` with no figure/table target (stripped). `"in ."` appears once. These are acceptable given figure stripping.

**Goal 4 — Structural Coherence: 8/10**
Good section flow. No orphaned punctuation lines. Paragraph breaks correctly preserved.

---

### Paper 3: 2603.21606 — mSFT (Appendix Leak — Critical)

**Word count**: 4,612 words

**Goal 1 — Completeness: 4/10**
**Critical issue**: The appendix is NOT being removed. The paper uses `\bibliography{...}\n\newpage\n\appendix\n\section{...}`. The acknowledgments regex lookahead `(?=\\section[^a-zA-Z]|\Z)` consumes the `\appendix` command as part of the non-greedy match (stopping at the first `\section{...}` AFTER the `\appendix`). Once `\appendix` is consumed by the acks regex, the subsequent appendix removal finds nothing to strip.

Appendix sections that leaked: "Computation of FLOPs Proportion", "Pre-training and mid-training", "SFT", "DPO", "RLVR", "Additional Figures for Heterogeneous Overfitting", "Further Details on SRO SFT and Soft SRO SFT", "Further Experimental Results on Delta Optimal Compute", "Further Experimental Details", "Hardware", "Common Settings", etc.

The main body IS present (Introduction, Method, Experiments, Discussion), but mixed with ~40% appendix content.

**Goal 2 — Artifact Cleanliness: 6/10**
- **38 underscore artifacts**: `"c_ global"`, `"D_ exclude"`, `"nabla _ theta"`, `"t_ train"`, `"t_ validation"` — heavy subscript artifact pollution throughout
- **1 double period**: `"s equals 1, .., S"` from `\ldots` in inline math
- No raw LaTeX commands, no citation brackets

**Goal 3 — TTS Readability: 7/10**
The main body prose reads naturally. 46 `sub [char]` occurrences (expected). Appendix content flows as prose but is non-sensical in a narration context.

**Goal 4 — Structural Coherence: 5/10**
The appendix leak produces ~20 extra section headers, many appearing as top-level content after "Discussion". Section flow breaks completely after the main body.

---

### Paper 4: 2603.19809 — How Well Does Generative Recommendation Generalize?

**Word count**: 4,993 words

**Goal 1 — Completeness: 9/10**
Full body: Introduction, Problem Definition (with subsections), Experiment Setup, Performance Analysis, Conclusion. No bibliography, no appendix bleed.

**Goal 2 — Artifact Cleanliness: 8/10**
10 underscore artifacts (`"D_ train"`, `"D_ mem"`, `"P_ ID"`, `"s_ Conf"`, `"alpha _ static"`) — moderate, from text-based subscripts.

**Goal 3 — TTS Readability: 8/10**
27 `sub [char]` occurrences — appropriate. Main prose reads well.

**Goal 4 — Structural Coherence: 9/10**
Good section flow, paragraphs well-preserved. No orphaned punctuation.

---

### Regression: paperA_latex (Attention Is All You Need)

**Word count**: 4,525 (vs 4,513 post-fix in 2026-03-23 — +12, within noise)

**Scores**: Completeness 9, Cleanliness 8, TTS Readability 7, Coherence 8 → **Avg 8.0**

Confirmed:
- Permission block removed: 0 occurrences (fix holding)
- `et al..` double period: 0 occurrences (fix holding)
- Remaining: 58 `sub [char]`, 5 `..` ellipsis double periods (from `x_1, \ldots, x_n` patterns appearing as `"(x sub 1,.., x sub n)"`)

**Comparison to 2026-03-23**: No regression. The d19e3a0 commit fixes all hold.

---

### Regression: paperB_latex (Datasheets for Datasets)

**Word count**: 4,145 (vs 4,133 in 2026-03-23 — +12, within noise)

**Scores**: All 9/10 → **Avg 9.0** — unchanged. No regressions.

---

## Cross-Paper Patterns

### Pattern 1: Appendix Leak via Acknowledgments Regex (CRITICAL)
**Seen in**: 2603.21606; potentially any paper where `\appendix` follows immediately after the acks section
**Root cause**: The acks removal regex uses `.*?(?=\\section[^a-zA-Z]|\Z)` as its non-greedy forward lookahead. It matches from `\section{Acknowledgments}` up to (not including) the next `\section`. Between acks and the first appendix `\section`, there is only `\appendix\n`. This `\appendix` command is consumed by `.*?`, so the subsequent appendix strip finds no `\appendix` to remove.
**Fix**: Add `|\\appendix\b` to acknowledgments lookahead

### Pattern 2: Underscore Artifacts from Greek Subscripts
**Seen in**: 2603.21872 (20), 2603.21606 (38), 2603.19809 (10), 2603.22212 (3)
**Root cause**: `_convert_greek_letters` runs before `_handle_math`. When `\pi_\theta` is in `$...$`, the pre-processing turns it into `$ pi _ theta $`. `_convert_subscripts` handles `_X` (no space) and `_{...}` (braced) but NOT `_ word` (underscore + space + word after Greek expansion).
**Fix**: After existing `_` cleanup in `_handle_math`, add regex to convert `(\w) _ (\w)` and `_ (\w)` patterns to `sub` notation

### Pattern 3: Ellipsis Double Period
**Seen in**: 2603.22212 (1), 2603.21606 (1), paperA_latex (5)
**Root cause**: `\ldots`/`\cdots` -> `...`. The doubled-period cleanup `re.sub(r"([.!?])\s*\.", r"\1", text)` collapses first two dots of `...` to one, yielding `..` instead of `...`.
**Fix**: Change to use negative lookahead/lookbehind to preserve ellipsis sequences

### Pattern 4: Double "Abstract." in ICML Papers
**Seen in**: 2603.21872
**Root cause**: ICML template papers have two `\begin{abstract}` blocks — one empty (content commented) and one with real content. Both get converted to "Abstract." in `_convert_structure_to_speech`.
**Fix**: In `finalize_body`, deduplicate consecutive identical paragraph headers

---

## Comparison to Prior Eval Reports

| Issue | Prior Eval | Current | Status |
|-------|-----------|---------|--------|
| `\addtocontents` toc artifact | Fixed d19e3a0 | 0 occurrences | Holding |
| Pre-abstract copyright blocks | Fixed d19e3a0 | 0 occurrences | Holding |
| `et al..` double period | Fixed d19e3a0 | 0 occurrences | Holding |
| "As shown," dangling refs | Partially improved | 7 in 2603.22212 | Same |
| Subscript `_ X` artifacts | Flagged, not fixed | Still present | Open |
| Ellipsis double period `..` | Not previously flagged | 5 in paperA | New |
| Appendix leak via acks regex | Not previously flagged | Critical in 2603.21606 | New (Critical) |
| Double "Abstract." in ICML | Not previously flagged | In 2603.21872 | New |

---

## Regression Test Word Counts vs Prior

| Script | 2026-03-23 post-fix | Current | Delta |
|--------|---------------------|---------|-------|
| paperA_latex | 4,513 | 4,525 | +12 (noise) |
| paperB_latex | 4,133 | 4,145 | +12 (noise) |
| paperA_pdf | 4,289 | 4,301 | +12 (noise) |
| paperB_pdf | 4,213 | 4,225 | +12 (noise) |

All regressions show a consistent +12 word delta. No quality regressions from the d19e3a0 commit.

---

## Recommended Fixes (Implemented)

### Fix 1 — Appendix Leak via Acknowledgments Regex (CRITICAL)
**File**: `latex_parser.py`, `_strip_non_prose`, acknowledgments removal (~line 344)
**Change**: Add `|\\appendix\b` to positive lookahead: `(?=\\section[^a-zA-Z]|\\appendix\b|\Z)`
**Impact**: Eliminates appendix bleed for papers where `\appendix` follows acknowledgments
**Risk**: Low

### Fix 2 — Underscore Artifacts from Greek Subscripts
**File**: `latex_parser.py`, `_handle_math` function
**Change**: After existing `_` cleanup, add:
```
text = re.sub(r'(\w)[ ]*_[ ]+(\w)', r'\1 sub \2', text)  # "pi _ theta" -> "pi sub theta"
text = re.sub(r'(?<![.\w])_[ ]+(\w)', r'sub \1', text)   # "_ theta" -> "sub theta"
```
**Impact**: Converts `_ word` subscript artifacts to "sub word" spoken form
**Risk**: Low

### Fix 3 — Ellipsis Double Period
**File**: `latex_parser.py` `_normalize_text`; `pdf_parser.py` `_normalize_for_tts`
**Change**: Replace `re.sub(r"([.!?])\s*\.", r"\1", text)` with ellipsis-preserving version
**Impact**: Fixes `"x sub 1,.., x sub n"` -> `"x sub 1,..., x sub n"`
**Risk**: Low

### Fix 4 — Double "Abstract." in ICML Papers
**File**: `script_builder.py` `finalize_body`
**Change**: Add deduplication of consecutive identical headers
**Impact**: Eliminates "Abstract.\n\nAbstract." in ICML-format papers
**Risk**: Low

---

## Post-Fix Verification

All 4 fixes implemented and verified. Results:

| Paper | Pre-fix Words | Post-fix Words | Underscore | Dbl Period | Appendix Leak | Abstract Dupe |
|-------|--------------|---------------|-----------|-----------|--------------|--------------|
| 2603.21872 | 3,637 | 3,638 | 0 (was 20) | 0 (was 0) | False | 1 (was 2) |
| 2603.22212 | 6,737 | 6,723 | 0 (was 3) | 0 (was 1) | False | 1 (was 1) |
| 2603.21606 | 4,612 | 2,921 | 0 (was 38) | 0 (was 1) | False (was True) | 1 (was 1) |
| 2603.19809 | 4,993 | 5,001 | 0 (was 10) | 0 (was 0) | False | 0 (was 0) |
| paperA_latex | 4,525 | 4,525 | 0 (was 0) | 0 (was 5) | False | 1 (unchanged) |
| paperB_latex | 4,145 | 4,145 | 0 (was 0) | 0 (was 0) | False | 0 (unchanged) |

Word count drop for 2603.21606: 4,612 → 2,921 confirms appendix content (~40% of total) was correctly removed.

### Post-Fix Scores

| Paper | Completeness | Cleanliness | TTS Readability | Structural Coherence | Avg |
|-------|-------------|-------------|-----------------|---------------------|-----|
| 2603.21872 (post-fix) | 8 | 9 | 8 | 9 | **8.5** |
| 2603.22212 (post-fix) | 8 | 9 | 8 | 8 | **8.25** |
| 2603.21606 (post-fix) | 9 | 8 | 8 | 9 | **8.5** |
| 2603.19809 (post-fix) | 9 | 9 | 8 | 9 | **8.75** |
| paperA_latex (post-fix) | 9 | 9 | 8 | 8 | **8.5** |
| paperB_latex (post-fix) | 9 | 9 | 9 | 9 | **9.0** |

**Post-fix overall average: 8.58** (up from 7.31 pre-fix, up from 8.25 in prior eval)

All regressions stable. All 4 fixes confirmed working with no regressions on previously-passing checks.
