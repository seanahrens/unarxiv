# LLM Script Evaluation Report — 2026-03-24 (Round 8)

## Context

**Cutoff commit**: `eval(round7): no new scripts; add section outro post-processing safety net` — 2026-03-24 03:41:56 -0600 (09:41:56 UTC)

**Scripts generated after cutoff**: 1

| Version ID | Paper ID | LLM | Created |
|------------|----------|-----|---------|
| 187 | 2508.06601 | openai/gpt-4o | 2026-03-24 21:33:59 |

**Paper**: "Deep Ignorance: Filtering Pretraining Data Builds Tamper-Resistant Safeguards into Open-Weight LLMs"
By Kyle O'Brien, Stephen Casper, Quentin Anthony, and 7 more authors. Published August 8, 2025.

---

## Executive Summary

**The evaluated script is catastrophically bad.** The LLM received only backslash-input file-reference commands (no actual paper content) and produced a speculative, summary-style narration describing what each appendix subsection "likely contains." The root cause is a structural bug in `_extract_raw_latex_text` (`source_download.py`), not a prompt failure.

| Goal | Score | Status |
|------|-------|--------|
| Goal 1: Near-verbatim fidelity | 1/10 | CRITICAL FAILURE |
| Goal 2: Citation/footnote stripping | N/A | (no content to strip from) |
| Goal 3: Header/footer compliance | 8/10 | OK |
| Goal 4: Figure/table description | 1/10 | CRITICAL FAILURE |
| Goal 5: TTS formatting | 4/10 | Structural defect dominates |

---

## Paper 1: 2508.06601 — Deep Ignorance

### Score Table

| Goal | Score | Evidence |
|------|-------|----------|
| Goal 1: Near-verbatim fidelity | 1/10 | LLM narrated file references, not paper content |
| Goal 2: Citation/footnote stripping | N/A | No real paper text to evaluate |
| Goal 3: Header/footer compliance | 8/10 | Header correct; footer has "un. archive dot org" literalism |
| Goal 4: Figure/table description | 1/10 | Zero figures described |
| Goal 5: TTS formatting | 4/10 | No LaTeX issues because no real content was narrated |

### Script Summary (2,976 bytes — entire output)

The script starts with "Moving on to the implementation details." and then describes each
appendix section using speculative language: "This section likely describes...",
"This would encompass...", "This part presumably outlines..."

The entire body covers only what the appendix sections "likely contain" based on their
filenames. The abstract, introduction, results, figures, tables, and discussion are
completely absent. The actual paper has ~200 pages of content.

### Specific Problems

1. **No paper content narrated.** The entire body is speculation about appendix file names.

2. **Speculative language throughout.** "likely", "presumably", "would encompass" — 
   violating guideline 1 (verbatim fidelity) and guideline 6 (no meta-commentary).

3. **Only appendix structure visible.** Jumps straight to "Implementation Details" 
   (a section heading that appears inline in main.tex at line 168) then only 
   file-reference commands follow.

4. **Sign-off contains "un. archive dot org"** — minor cosmetic issue.

---

## Root Cause Analysis

### The Bug: end{document} Truncation Destroys Multi-File Papers

The bug is in `_extract_raw_latex_text` in `source_download.py`. The function:

1. Extracts ALL `.tex` files from the archive, sorts them alphabetically within each directory, and concatenates them with newlines.
2. Files are visited root-first by os.walk: main.tex comes first.

Then `_strip_latex_preamble` calls `_strip_latex_document_tail`, which finds the FIRST
`\end{document}` — which is in main.tex (line 183 for this paper). Everything after it
(ALL the actual section content files) is silently discarded.

After truncation, only main.tex up to `\end{document}` remains. Then `_strip_latex_preamble`
looks for the first `\section{}` command. Since all the main content sections are in
separate files (`\input{sections/1_introduction}` etc.), the first explicit `\section{}`
in main.tex is `\section{Implementation Details}` at line 168 — in the appendix block.

The LLM then receives only:
  - `\section{Implementation Details}`
  - A series of `\input{sections/appendix/...}` commands
  - No actual paper content whatsoever

### Why This Wasn't Caught Earlier

Rounds 5-7 used papers where main.tex contained inline content. The `\end{document}` 
fix in Round 6 was designed to strip trailing template boilerplate in single-file papers.
It introduced a regression for multi-file papers: the first `\end{document}` (in main.tex)
truncates all content files when the result is a concatenation.

Multi-file organization (`\input{}` throughout) is the dominant pattern for conference
submissions (NeurIPS, ICLR, ICML templates). This bug affects the majority of complex papers.

### Why Prompt Fixes Cannot Help

This is a data pipeline failure, not an LLM instruction-following failure. The LLM
received no actual paper content. No prompt improvement can narrate content never passed in.

---

## Cross-Paper Pattern Analysis vs. Prior Rounds

| Issue | Prior Rounds | This Round |
|-------|-------------|------------|
| Section outros ("This concludes...") | Rounds 2-6 persistent | N/A (no content) |
| Abstract meta-wrapping | Rounds 3-6 | N/A (no content) |
| Raw LaTeX math delimiters | Round 5 | N/A (no content) |
| Macro expansion failure | Rounds 3-5 | N/A (no content) |
| input/include resolution failure | NEW | CRITICAL FAILURE |

---

## Model/Provider Assessment

Current model: `gpt-4o` (openai)

The failure this round is a pipeline bug, not a model deficiency. After fixing the
pipeline, the key model question is whether the prior section-outro pattern (4+ rounds,
GPT-4o) remains. The Round 7 post-processing safety net mitigates it at code level.

If section outros reappear on new papers post-fix, consider switching to claude-sonnet-4-6
which shows stronger adherence to complex multi-rule instruction prompts.

---

## Fix Implemented in This Round

### Fix (CRITICAL, Code): Resolve input/include commands in LaTeX source extraction

Replace the alphabetical file concatenation in `_extract_raw_latex_text`
(`source_download.py`) with a proper recursive resolver:

1. Find the main `.tex` file (the one containing `\documentclass`)
2. Starting from main.tex, recursively replace each `\input{filename}` and
   `\include{filename}` command with the actual content of the referenced file
3. Return the fully inlined, single-document LaTeX string (capped at max_chars)

This ensures:
- Content follows the logical document order
- `\end{document}` only appears once (at the true end of the inlined document)
- The LLM receives complete paper content, not file references
- Preamble stripping works correctly (abstract/introduction in correct position)
