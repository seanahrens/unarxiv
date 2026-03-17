# Improvement Plan: `tex_to_audio.py`

All fixes are pure Python (regex/string processing). No paid API calls. All changes target `unarxiv-web/modal_worker/tex_to_audio.py`.

---

## LaTeX Processor (`clean_latex` + helpers)

### Fix 1: Drop `thebibliography` environment entirely
**Problem:** The `\begin{thebibliography}...\end{thebibliography}` block contains all formatted references (BibTeX keys, author names, titles, arXiv IDs) which appear verbatim in the output.

**Root cause:** Step 12 in `clean_latex` drops `figure`, `table`, `icmlauthorlist` but not `thebibliography`.

**Fix:** Add `thebibliography` to step 12's drop-environment regex.

```python
# BEFORE:
text = re.sub(
    r"\\begin\{(figure|table|icmlauthorlist)[*]?\}.*?\\end\{\1[*]?\}", "", text, flags=re.DOTALL
)

# AFTER:
text = re.sub(
    r"\\begin\{(figure|table|icmlauthorlist|thebibliography)[*]?\}.*?\\end\{\1[*]?\}", "", text, flags=re.DOTALL
)
```

Also, add a belt-and-suspenders fallback to strip from the `\bibitem` onwards, in case the bibliography is embedded in a different structure:

```python
# Strip everything from the first \bibitem onward (inline bibliographies)
text = re.sub(r"\\bibitem\{[^}]*\}.*", "", text, flags=re.DOTALL)
```

---

### Fix 2: Drop align/eqnarray display math environments
**Problem:** `align`, `eqnarray`, `multline`, `gather`, `aligned`, `split` environments produce raw `&=` equation rows in the output.

**Root cause:** Step 16a drops `\[...\]` and `$$...$$` display math but not named display-math environments. Step 13's general env handler strips the `\begin{align}` tags but keeps the body.

**Fix:** Add these environments to the drop-block in step 12, BEFORE step 13's general env handler.

```python
# After existing figure/table/thebibliography drop:
DISPLAY_MATH_ENVS = (
    "align", "align\\*", "eqnarray", "eqnarray\\*",
    "multline", "multline\\*", "gather", "gather\\*",
    "aligned", "split", "subequations", "dcases",
)
for env in DISPLAY_MATH_ENVS:
    text = re.sub(
        rf"\\begin\{{{re.escape(env)}\}}.*?\\end\{{{re.escape(env)}\}}",
        "", text, flags=re.DOTALL
    )
```

Or more compactly as one regex:

```python
text = re.sub(
    r"\\begin\{(align\*?|eqnarray\*?|multline\*?|gather\*?|aligned|split|subequations|dcases)\}.*?\\end\{\1\}",
    "", text, flags=re.DOTALL
)
```

---

### Fix 3: Fix `\color{...}` artifact (accent regex false-positive)
**Problem:** `\color{red}` becomes `olorred` because `_latex_accents_to_unicode`'s bare-accent regex `\\([cHdrukvk])(?=[a-zA-Z])(\w)` incorrectly matches `\c` inside `\color`.

**Root cause:** The bare-accent regex doesn't verify it's at the end of a command. `\c` in `\color` matches because the lookahead `(?=[a-zA-Z])` sees `o`, and `(\w)` captures `o`. The `_replace_bare` returns `o` (unknown base for cedilla), leaving `olor{red}`, then `{red}` braces are stripped, yielding `olorred`.

**Fix A:** Add a negative lookahead to ensure the letter after the accent command is NOT followed by more word characters (i.e., it IS a single-letter base character):

```python
# BEFORE:
text = re.sub(r"\\([cHdrukvk])(?=[a-zA-Z])(\w)", _replace_bare, text)

# AFTER: require that the base char is the last letter of the "word"
text = re.sub(r"\\([cHdrukvk])([a-zA-Z])(?!\w)", _replace_bare, text)
```

**Fix B (belt-and-suspenders):** Also explicitly strip color-related commands BEFORE accent conversion (in step 8 or new step 8a):

```python
# Strip color commands (no spoken content)
text = _drop_braced_command(text, "color")
text = _drop_braced_command(text, "textcolor")  # keep content: \textcolor{red}{text} → text
# Actually textcolor keeps inner content:
text = re.sub(r"\\textcolor\{[^}]*\}\{([^}]*)\}", r"\1", text)
text = re.sub(r"\\color\{[^}]*\}", "", text)
text = re.sub(r"\\colorbox\{[^}]*\}\{([^}]*)\}", r"\1", text)
text = re.sub(r"\\fcolorbox\{[^}]*\}\{[^}]*\}\{([^}]*)\}", r"\1", text)
```

---

### Fix 4: Strip escaped special chars `\_`, `\#`, `\%`, `\&`
**Problem:** `step\_num` appears as literal `step\_num` in output because `\_` is not handled.

**Root cause:** Step 20's `\\[a-zA-Z]+\*?` only removes backslash-commands starting with letters. `\_` has `_` (non-letter) after backslash.

**Fix:** Add explicit handling before step 20:

```python
# Strip LaTeX text-mode special character escapes
text = text.replace("\\_", " ")   # \_  → space (underscore in math context)
text = text.replace("\\#", "")    # \#  → drop
text = text.replace("\\%", "%")   # \%  → literal percent
text = text.replace("\\&", " and ")  # \& → "and" (common in author lists)
text = text.replace("\\$", "")    # \$  → drop (literal dollar sign)
```

---

### Fix 5: Add Greek letter translations for inline math
**Problem:** Inline math `$\beta_1=0.9$` strips to `1=0.9` because `\beta` is removed as an unknown command and the subscript `_1` leaves bare `1`.

**Root cause:** Step 20 removes all unrecognized LaTeX commands including Greek letters. Step 16c keeps inline math content but the cleanup leaves orphaned subscript numbers.

**Fix:** Before the final command-strip in step 20, translate common Greek letters to their English names. Add a new helper map and substitution:

```python
_GREEK_LETTERS = {
    r"\alpha": "alpha", r"\beta": "beta", r"\gamma": "gamma",
    r"\delta": "delta", r"\epsilon": "epsilon", r"\varepsilon": "epsilon",
    r"\zeta": "zeta", r"\eta": "eta", r"\theta": "theta",
    r"\iota": "iota", r"\kappa": "kappa", r"\lambda": "lambda",
    r"\mu": "mu", r"\nu": "nu", r"\xi": "xi", r"\pi": "pi",
    r"\rho": "rho", r"\sigma": "sigma", r"\tau": "tau",
    r"\upsilon": "upsilon", r"\phi": "phi", r"\chi": "chi",
    r"\psi": "psi", r"\omega": "omega",
    r"\Alpha": "Alpha", r"\Beta": "Beta", r"\Gamma": "Gamma",
    r"\Delta": "Delta", r"\Theta": "Theta", r"\Lambda": "Lambda",
    r"\Pi": "Pi", r"\Sigma": "Sigma", r"\Phi": "Phi", r"\Psi": "Psi",
    r"\Omega": "Omega",
}

for cmd, name in _GREEK_LETTERS.items():
    text = text.replace(cmd, f" {name} ")
```

This should be applied inside inline math before step 20, or better: add a step 16e after the inline math `$...$` → ` \1 ` expansion.

---

### Fix 6: Fix `\label` stripping consuming trailing newline
**Problem:** `\label{sec:results}` strip removes the newline after it, causing the next line (e.g., `Machine Translation.`) to merge with the preceding marker token, creating mangled section titles.

**Root cause:** Step 9's regex for `label` is `r"\\(... label ...)[^\n]*\n?"` — the `\n?` at the end optionally consumes the newline.

**Fix:** Remove `\n?` from the label-strip portion, or handle `label` separately:

```python
# Strip \label{...} without consuming trailing newline
text = re.sub(r"\\label\{[^}]*\}", "", text)
```

Add this as an early preprocessing step (before step 9) and remove `label` from step 9's list.

---

### Fix 7: Strip figure/table reference phrases
**Problem:** `(figure to figure )` and `Figure ` (with empty ref) remain after `\ref{}` removal.

**Fix:** After removing `\ref` in step 15, also strip orphaned figure/table reference phrases:

```python
# Strip "figure~\ref{...}" → "" (already done by step 15 \ref removal)
# Also clean up orphaned "Figure " / "Table " with empty following ref
text = re.sub(r"(?:Figure|figure|Fig\.|fig\.|Table|table)\s+", "", text)
# Strip empty parens
text = re.sub(r"\(\s*\)", "", text)
text = re.sub(r"\[\s*\]", "", text)
```

Wait — this is too aggressive (would strip "Figure" from "Figure 1 shows..." prose). Better approach: only strip the orphaned word when it's followed by nothing useful:

```python
# After all \ref removal, clean up dangling "Figure" / "Table"
# that now have no following content
text = re.sub(r"\b(?:Figure|Fig\.|Table)\s+(?=[,.\s]|$)", "", text, flags=re.MULTILINE)
```

---

### Fix 8: Strip appendix section (optional but beneficial)
**Problem:** Appendices often contain raw mathematical proofs and visualizations that are unreadable aloud.

**Fix:** Strip from `\appendix` or `\section{Appendix}` or `\begin{appendix}` to end of document:

```python
# Remove everything from the appendix onward
text = re.sub(
    r"\\appendix\b.*",
    "", text, flags=re.DOTALL
)
text = re.sub(
    r"\\section\*?\{Appendix(?:es)?\}.*",
    "", text, flags=re.DOTALL | re.IGNORECASE
)
```

---

## PDF Processor (`_clean_pdf_text`)

### Fix 9: Strip inline citation brackets
**Problem:** `[13]`, `[7, 35, 2, 5]`, `[e.g., 13]` etc. appear throughout.

**Fix:** Add after form-feed removal:

```python
# Strip numeric citation brackets [1], [1,2], [1, 2, 3], etc.
text = re.sub(r"\[\d+(?:[,;]\s*\d+)*\]", "", text)
# Strip author-year citations in brackets [Author 2021]
text = re.sub(r"\[[A-Z][^\]]{1,40}\d{4}[^\]]{0,20}\]", "", text)
```

---

### Fix 10: Strip running headers/footers
**Problem:** `Gebru et al.`, `Datasheets for Datasets`, and `arXiv:...` lines appear as standalone short lines throughout PDF output.

**Fix (multi-part):**

```python
# Strip arXiv stamp lines
text = re.sub(r"^arXiv:\d{4}\.\d{4,5}[^\n]*\n?", "", text, flags=re.MULTILINE)

# Strip "Author et al." running headers (standalone lines)
text = re.sub(r"^\s*[A-Z][a-z]+ et al\.\s*$\n?", "", text, flags=re.MULTILINE)

# Strip lines that start with ∗, †, ‡ (footnote markers)
text = re.sub(r"^[∗†‡✝]\s*.+$", "", text, flags=re.MULTILINE)
```

For the paper title running header (repeating title like "Datasheets for Datasets" mid-document), we can detect it by passing the title parameter and stripping standalone matching lines after the first page:

```python
if title:
    # Strip running-header occurrences of the title (after first ~500 chars)
    escaped = re.escape(title)
    text = re.sub(rf"(?<!\A.{{0,500}})\n\s*{escaped}\s*\n", "\n", text, flags=re.DOTALL)
```

---

### Fix 11: Strip standalone section numbers
**Problem:** Lines like `3.1`, `3.2.1` appear as lone lines (PDF subsection number labels).

**Fix:**

```python
# Remove standalone section/subsection number lines (e.g. "3.1", "2.4.1")
text = re.sub(r"^\s*\d+(?:\.\d+)+\s*$", "", text, flags=re.MULTILINE)
```

---

### Fix 12: Strip author affiliation blocks in PDF
**Problem:** `Authors' addresses: ...` affiliation metadata block leaks into body.

**Fix:** Add to `_strip_pdf_title_block` or as a separate cleanup:

```python
# Strip author affiliation lines
text = re.sub(r"^Authors' addresses:.*?(?=\n[A-Z])", "", text, flags=re.DOTALL | re.MULTILINE)
text = re.sub(r"^\s*†Work performed.*$", "", text, flags=re.MULTILINE)
text = re.sub(r"^\s*‡Work performed.*$", "", text, flags=re.MULTILINE)
```

---

### Fix 13: Strip inline URLs
**Problem:** `https://github.com/tensorflow/tensor2tensor` and similar URLs appear inline.

**Fix (enhancement to existing URL removal):** The existing code strips standalone URL lines. Extend to inline URLs:

```python
# Strip inline URLs (not just standalone-line URLs)
text = re.sub(r"https?://\S+", "", text)
```

---

### Fix 14: Better footnote suppression
**Problem:** Footnote text (marked with `1`, `∗` etc.) gets mixed into body.

The current code strips standalone single/double-digit lines (`^\d{1,2}$`), but footnote marker `1` appended to sentence (`misuse.1`) and full footnote text aren't caught.

**Fix:**

```python
# Strip footnote marker digits attached to words (e.g. "misuse.1" → "misuse.")
text = re.sub(r"(?<=[.!?,])\d{1,2}(?=\s)", "", text)

# Strip lines starting with footnote markers like "1Text" or "∗Text"
text = re.sub(r"^\d{1,2}[A-Z].+$", "", text, flags=re.MULTILINE)
```

---

## Architecture Assessment

**Is a full rewrite warranted?**

- **LaTeX path**: No rewrite needed. The pipeline architecture (preamble drop → environment handling → marker insertion → marker-to-speech) is sound. The bugs are specific and fixable with targeted changes.

- **PDF path**: No rewrite needed, but the ordering of operations matters. Recommend moving citation stripping and header stripping to before the column-rejoining step, so they don't interfere with line-join heuristics.

**Recommended operation order for `_clean_pdf_text`:**
1. Page break handling (existing)
2. Hyphen rejoin (existing)
3. Strip arXiv stamps, running headers, footnote-marker lines (NEW)
4. Strip title/author block (existing `_strip_pdf_title_block`)
5. Strip affiliation block (NEW)
6. Page number removal (existing)
7. URL stripping (enhanced)
8. Citation bracket stripping (NEW)
9. Footnote number inline stripping (NEW)
10. References section removal (existing)
11. Acknowledgments removal (existing)
12. Figure/table caption removal (existing)
13. Table-row data removal (existing)
14. Column-line rejoining (existing)
15. Whitespace normalization (existing)

---

## Known Limitations (require LLM to fix properly)

1. **Complex inline math**: `$\sum_{i=1}^n x_i$` → "x" after cleanup. Rule-based translation of arbitrary math to speech is impossible. An LLM pass could render this as "the sum from i equals 1 to n of x sub i" but this requires semantic understanding.

2. **Table contents**: We drop numeric-heavy rows but cannot summarize table content ("Table 2 shows model variants with BLEU scores"). An LLM could summarize.

3. **Algorithm/pseudocode blocks**: `algorithm`, `algorithmic` environments are currently dropped with step 12's env-strip. This is correct behavior (pseudocode can't be read aloud), but an LLM could convert `for i=1 to n do` to a verbal description.

4. **Figure captions with meaningful content**: We drop all figure captions. Some contain important information. An LLM could select which to include.

5. **PDF column ordering**: Multi-column PDFs sometimes interleave text from left and right columns. The `_rejoin_column_lines` heuristic only helps with line-level breaks, not full column reordering.
