# Script Improvement Plan

All fixes are pure Python/regex — no LLM calls. Implemented in `tex_to_audio.py`.

## LaTeX Path Fixes

### Fix 1: Bare-accent false-positive (`\color` → `olorred`)
**Root cause**: `_latex_accents_to_unicode()` regex `\\([cHdrukvk])(?=[a-zA-Z])(\w)` matches `\c` in `\color` because lookahead sees `o` and captures `o`, producing `o` (cedilla of unknown base), leaving `lor{red}`.
**Fix**: Change to require base char NOT followed by more word chars: `([a-zA-Z])(?!\w)`.

### Fix 2: Color commands leaking
**Fix**: Strip `\textcolor`, `\colorbox`, `\fcolorbox`, `\color` before accent processing.

### Fix 3: Acknowledgments `\subsection*` not caught
**Root cause**: Acknowledgments regex only matched `\section*{Acknowledg...}`.
**Fix**: Changed to `\\(?:sub)*section\*?` to match any level.

### Fix 4: Appendix content leaking
**Fix**: Strip `\appendix` and `\section*{Appendix...}` plus everything after.

### Fix 5: `\label` consuming trailing newline
**Root cause**: `\label` was in the big layout-commands regex with `[^\n]*\n?`, consuming the trailing newline, merging section headers with body text.
**Fix**: Separate dedicated `re.sub(r"\\label\{[^}]*\}", "", text)` without newline consumption.

### Fix 6: `thebibliography` + `\bibitem` not dropped
**Fix**: Add `thebibliography` to the drop-entire-env list; add `\bibitem` fallback strip.

### Fix 7: Display-math environments leaking (`&=` artifacts)
**Root cause**: `align`, `eqnarray` etc. had outer tags stripped but body content remained.
**Fix**: Drop all display-math environments entirely (`align*?`, `eqnarray*?`, `multline*?`, `gather*?`, etc.).

### Fix 8: Greek letters as raw LaTeX
**Fix**: Add `_GREEK` dict mapping `\alpha` → `"alpha"` etc. for all standard Greek letters.

### Fix 9: `\_`, `\#`, `\$`, `\&` not cleaned
**Fix**: Replace `\_` → space, strip `\#`/`\$`, replace `\&` → ` and `.

### Fix 10: Orphaned Figure/Table/Eq. references
**Fix**: Strip `\ref`, `\eqref`, `\autoref`, `\cref` etc.; clean up orphaned "Figure ", "Table ", "Eq. " before punctuation; clean empty `()` and `[]`.

---

## PDF Path Fixes

### Fix 11: Inline citation brackets `[1]`, `[1,2,3]`
**Fix**: `re.sub(r"\[\d+(?:[,;]\s*\d+)*\]", "", text)` applied early in `_clean_pdf_text`.

### Fix 12: arXiv stamp lines
**Fix**: `re.sub(r"^arXiv:\S+[^\n]*\n?", "", text, flags=re.MULTILINE)`.

### Fix 13: Running `et al.` headers
**Fix**: `re.sub(r"^\s*[A-Z][a-z]+(...) et al\.\s*$\n?", "", text, flags=re.MULTILINE)` strips standalone "Author et al." lines while preserving inline "Luong et al. (2015)" citations.

### Fix 14: Standalone section numbers (`3.1`, `2.4.1`)
**Fix**: `re.sub(r"^\s*\d+(?:\.\d+)+\s*$", "", text, flags=re.MULTILINE)`.

### Fix 15: Authors' addresses block
**Fix**: `re.sub(r"^Authors\S*\s*addresses:.*?(?=\n[A-Z])", "", text, flags=re.DOTALL | re.MULTILINE)`.

### Fix 16: Inline URLs in PDF body
**Fix**: `re.sub(r"https?://\S+", "", text)` (supplements the existing per-line URL filter).

### Fix 17: Footnote digit markers after punctuation
**Fix**: `re.sub(r"(?<=[.!?,;])\d{1,2}(?=\s)", "", text)`.

### Fix 18: Running short-title suppression
**Fix**: When `title` is provided, detect repeated occurrences of first 4 title words after char 500 and remove them (≥2 occurrences triggers suppression).

---

## Priority / Impact Summary

| Fix | Impact | Difficulty |
|-----|--------|-----------|
| Fix 1 (olorred) | High | Easy |
| Fix 6 (bibliography) | High | Easy |
| Fix 7 (display-math) | High | Easy |
| Fix 5 (label newline) | Medium | Easy |
| Fix 11 (PDF citations) | High | Easy |
| Fix 13 (running headers) | High | Easy |
| Fix 14 (section numbers) | High | Easy |
| Fix 8 (Greek letters) | Medium | Easy |
| Fix 3 (acks) | Medium | Easy |
| Fix 4 (appendix) | Medium | Easy |
| Fix 15 (authors addresses) | Medium | Easy |
| Fix 18 (running title) | Medium | Medium |
