# Regex Parser Eval — Round 11 (2026-03-25)

## Summary

| | |
|---|---|
| **Parser commit** | `971153f` (2026-03-25 03:07 CST / 09:07 UTC) |
| **Prior commit (r10 base)** | `b9f62a1` |
| **Eval date** | 2026-03-25 |
| **Papers evaluated** | 5 (4 LaTeX, 1 PDF) |
| **Avg score** | 7.5/10 |
| **Critical bugs found** | 2 (escaped-dollar math leak, longtable not stripped) |

**Fixes in 971153f** vs b9f62a1: `\abstract{}` command form + `\xspace` macro expansion.

---

## Per-Paper Results

### Paper 1 — 2603.09151 (Deep Tabular Research)
*LaTeX source · version_id 220 · 4797 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 9/10 |
| Artifact Cleanliness | 9/10 |
| TTS Readability | 8.5/10 |
| Structural Coherence | 9/10 |
| **Overall** | **9/10** |

**Notes:** Clean output with no LaTeX artifacts. The single instance of `i.d.,` (for `i.e.,`) is present in the original paper — correctly preserved rather than wrongly converted. Math expressions handled well: `sub i`, `equals`, `to the n`. Section headers converted naturally with trailing periods. The paper contains literal `[THINK] / [CODE]` tokens (the paper's own notation for their framework) which are preserved as-is — appropriate. Minor: a few "sub 1, o sub 2" sequences are verbose but correct.

---

### Paper 2 — 2404.10636 (What are human values, and how do we align AI to them?)
*LaTeX source · version_id 219 · 11212 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 9.5/10 |
| Artifact Cleanliness | 10/10 |
| TTS Readability | 9/10 |
| Structural Coherence | 9/10 |
| **Overall** | **9.3/10** |

**Notes:** Excellent output. Natural prose flows well throughout a long philosophical/technical paper. Citations stripped cleanly. `e.g.` → `for example,` and `i.e.` → `that is,` conversions working perfectly. Section headers flow naturally. The "etc." references in the original paper are correctly preserved (they're the paper author's own text, not LaTeX artifacts). Footer complete with correct authors.

---

### Paper 3 — 2603.22330 (CHANRG: RNA structure benchmarking)
*LaTeX source · version_id 218 · 5462 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 9/10 |
| Artifact Cleanliness | 9/10 |
| TTS Readability | 8/10 |
| Structural Coherence | 9/10 |
| **Overall** | **8.8/10** |

**Notes:** Three occurrences of " minus " in the output — all are **legitimate math** (e.g., `10 to the power of minus 3`, `10 to the power of minus 4`). These are correct conversions of `10^{-3}` in LaTeX. Confidence interval notation `[0.6004, 0.7300]` is preserved (these are not citation markers, and the parser correctly distinguishes them from `[1]` style citations). Some statistical notation reads verbose but is intelligible. The paper is math-heavy but the parser handles it acceptably.

---

### Paper 4 — 2603.22327 (LLM Systematic Review benchmark)
*LaTeX source · version_id 211 · 1585 words (expected ~6000+)*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 2/10 |
| Artifact Cleanliness | 2/10 |
| TTS Readability | 2/10 |
| Structural Coherence | 4/10 |
| **Overall** | **2.5/10** |

**Notes:** **Catastrophic failure.** The paper uses `\$137` and `\$50` (LaTeX-escaped currency dollar signs for USD amounts). The inline math regex `r"\$([^$]+)\$"` treats `\$` as a math delimiter, creating spans like `$137 billion ... gpt-oss-120b ... self-hosting $50` as "inline math expressions." This causes:

1. **Artifact injection**: Hyphens within the span become `minus` — producing `self minus hosting`, `gpt minus oss minus 120b`, `full minus text screening` (40 occurrences).

2. **Content deletion**: Larger `\$...\$` spans (up to 3864 chars) exceed the complexity threshold (>8) and return `""`, deleting entire paragraphs. Only ~25% of the paper's content survives.

3. **Table data leakage**: The paper uses `longtable` for its results tables, which is not in the `_strip_non_prose` environment list. Raw table rows with numerical data leak into the narration.

**Root cause in `_handle_math`**: The `text.replace("\\$", "dollar ")` call happens in `_normalize_text` — called **after** `_handle_math`. It must be moved to run **before** the inline math regex.

---

### Paper 5 — 2603.22570 (CanViT: Active Vision Foundation Models)
*PDF source · version_id 210 · 4885 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 8/10 |
| Artifact Cleanliness | 7/10 |
| TTS Readability | 7/10 |
| Structural Coherence | 8/10 |
| **Overall** | **7.5/10** |

**Notes:** PDF path produces generally readable output. Main artifact: Unicode math characters from PDF extraction are preserved literally — e.g., `𝑡`, `𝑥`, `𝑦`, `𝒗𝑡`, `𝑠𝑡`. These appear throughout the text and would be read as individual symbol names or skipped by TTS. The PDF parser does not have a Unicode math symbol → spoken form mapping. Additionally, some inline math content is preserved as-is (e.g., `(𝑥 𝑠, 𝑦 𝑠, log 𝑠)`). "Figure N" inline references are correctly preserved (not captions). Footer complete.

---

## Regression Results

| Paper | r10 baseline | r11 pre-fix | r11 post-fix | Delta (post vs r10) |
|---|---|---|---|---|
| paperA (1609.07093) | 4521 | 4461 | 4495 | −26 (noise) |
| paperB (2106.13884) | 4139 | 4083 | 4135 | −4 (noise) |

Pre-fix: small negative deltas (−60, −56) from the `971153f` baseline, within normal noise.
Post-fix: word counts recover to near-baseline. No regression introduced. Both regression papers don't use `\$` currency, so the fix has no effect on them (as expected).

---

## Cross-Paper Patterns

**LaTeX vs PDF quality**: LaTeX papers score 9.0 average (when working correctly); PDF papers score 7.5 — lower due to Unicode math char leakage from PyMuPDF.

**Math handling**: Generally good for `\frac`, `\sqrt`, superscripts/subscripts. The `minus` conversion is correct for negative exponents (`10^{-3}`). The false-positive `minus` bug only triggers when `\$` currency escapes create fake math spans.

**Citations**: Stripped cleanly across all papers. The `[0.6004, 0.7300]` pattern in paper3 is correctly not stripped (not a citation).

**Headers**: All LaTeX papers convert headers to spoken-form periods correctly. No raw `\section{}` artifacts observed.

---

## Bugs Found

### Bug 1 (CRITICAL): Escaped dollar `\$` treated as math delimiter

**File**: `parser_v2/latex_parser.py`, function `_handle_math`
**Symptom**: Currency amounts like `\$137` create fake inline math spans, causing hyphens to become `minus` and long spans to be deleted entirely.
**Fix**: Move `text.replace("\\$", "dollar ")` to run **before** the inline math regex in `_handle_math`, and remove the duplicate call from `_normalize_text`.

```python
def _handle_math(text: str) -> str:
    # Convert escaped dollar signs FIRST — before inline math regex
    text = text.replace("\\$", "dollar ")
    # ... then proceed with display and inline math stripping
```

### Bug 2: `longtable` environment not stripped

**File**: `parser_v2/latex_parser.py`, function `_strip_non_prose`
**Symptom**: Papers using `longtable` (common for multi-page tables) have table rows leak into narration.
**Fix**: Add `longtable` to the stripped environments regex:

```python
r"\\begin\{(figure|table|longtable|icmlauthorlist|thebibliography)[*]?\}.*?\\end\{\1[*]?\}"
```

---

## Implemented Fixes

Both bugs fixed in `parser_v2/latex_parser.py`:

1. **`\$` currency fix** (`_handle_math`): Added `text.replace("\\$", "dollar ")` as the first line in `_handle_math`, before the display math and inline math regexes. Removed the duplicate call from `_normalize_text`.

2. **`longtable` stripping** (`_strip_non_prose`): Added `longtable` to the `_strip_non_prose` environment regex alongside `figure|table|icmlauthorlist|thebibliography`.

**Paper 4 post-fix result**: 5057 words (was 1585, +219%), 4 legitimate "minus" occurrences (was 40 artifacts), all from `\pm` ± notation.

Regression tests pass. Word counts stable within noise range.
