# Script Quality Audit

## Test Papers

- **Paper A** (`paperA`): "Attention Is All You Need" (Vaswani et al., 2017) — math-heavy ML paper
- **Paper B** (`paperB`): "Datasheets for Datasets" (Gebru et al., 2018) — text-heavy social/policy paper

## Scoring Rubric (1-10)

| Dimension | Meaning |
|-----------|---------|
| Completeness | Is the main content present? Are sections/abstracts intact? |
| Cleanliness | Are LaTeX/PDF artifacts absent? |
| Readability | Does it read as natural prose? |
| TTS-readiness | No symbols/tokens that a TTS system can't speak? |

---

## Baseline Scores (v2 scripts, pre-improvement)

### paperA_latex (LaTeX path, "Attention Is All You Need")

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 7/10 | Abstract and main sections present; appendix leaking in |
| Cleanliness | 4/10 | `olorred` artifact, `bibitem` entries, `&=` align-env leakage, marker tokens |
| Readability | 5/10 | Equation fragments mixed into prose; acknowledgments present |
| TTS-readiness | 4/10 | `\\label{...}` stripping merging section headers; `\\alpha`, `\\beta` as raw LaTeX |
| **Average** | **5.0** | |

Key problems found:
- `\color{red}` → `olorred` (bare-accent regex false-positive)
- `thebibliography` env not dropped; `\bibitem` entries in output
- `align`/`eqnarray` environments: tags stripped but body (`&=`) leaked
- `\label` stripping consumed trailing newline, merging section names with body
- Acknowledgments section not stripped for `\subsection*{Acknowledgments}` variant
- Appendix content present
- Greek letters as raw LaTeX (`\alpha`, `\beta`)
- `\_` escape rendered as literal `_`
- `SECTION_START` / `SECTION_END` marker tokens visible (orphaned)

---

### paperB_latex (LaTeX path, "Datasheets for Datasets")

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 8/10 | Main body intact; good section coverage |
| Cleanliness | 6/10 | `\bibitem` leakage; acknowledgment section present |
| Readability | 7/10 | Mostly reads well; prose-heavy paper benefits from LaTeX path |
| TTS-readiness | 6/10 | Some citation commands remaining; `\subsection*{Acknowledgments}` not caught |
| **Average** | **6.75** | |

Key problems found:
- `thebibliography` env not dropped
- `\subsection*{Acknowledgments}` not caught by acknowledgments-strip regex (only matched `\section*`)
- Appendix content leaking

---

### paperA_pdf (PDF path, "Attention Is All You Need")

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 6/10 | Body mostly present; some column-break issues |
| Cleanliness | 3/10 | 56 citation brackets `[1]`, 86 standalone section numbers, arXiv stamp |
| Readability | 5/10 | Running-header noise; broken equation text; author affiliation block |
| TTS-readiness | 3/10 | Math formulas, citation brackets, section numbers garble the audio |
| **Average** | **4.25** | |

Key problems found:
- 56 inline citation brackets `[1]`, `[2,3]`
- 86 standalone section numbers (`3.1`, `2.4.1`) on separate lines
- arXiv stamp (`arXiv:1706.03762v5 [cs.CL] 6 Dec 2017`)
- Author affiliation block (name + email + affiliation per line)
- Math formula artifacts in body text (`QKT√dk V`, `LayerNorm(x + Sublayer(x))`)
- Footnote digit markers after sentences

---

### paperB_pdf (PDF path, "Datasheets for Datasets")

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 7/10 | Main body intact; good prose coverage |
| Cleanliness | 4/10 | 5× "Gebru et al." running headers, citation brackets, footnote content |
| Readability | 6/10 | Mostly natural but interrupted by headers |
| TTS-readiness | 5/10 | Citation brackets and running headers disruptive |
| **Average** | **5.5** | |

Key problems found:
- "Gebru et al." / "Datasheets for Datasets" running headers on every page
- Citation brackets (inline)
- "Authors' addresses:" block mid-text
- Footnote content ("1We note that...") merged into body
- Some citation-stripped whitespace gaps

---

## Summary

| Script | Avg Score |
|--------|-----------|
| paperA_latex | 5.0 |
| paperB_latex | 6.75 |
| paperA_pdf | 4.25 |
| paperB_pdf | 5.5 |

**LaTeX path consistently outperforms PDF path**, especially for math-heavy papers. The PDF path is necessary when LaTeX source is unavailable but requires more aggressive cleaning.
