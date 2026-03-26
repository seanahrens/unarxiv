# Error Catalog — Regex Scripter (commit `1175bd7`)

Eval date: 2026-03-26 | Papers evaluated: 5 (2603.23994, 2503.05830, 2311.02242, 2602.13920, 2312.03893)

---

## Error: Pre-abstract content not stripped for journal-format LaTeX

**Goal**: Header/Footer Compliance (Goal 3) + Artifact Cleanliness (Goal 2)
**Severity**: high — unlistenable section with emails, ORCID numbers, table of contents
**Frequency**: 1/5 papers (2503.05830)
**Paper(s)**: 2503.05830

### What the scripter produced
> "Revel and Penigaud (2025)
> 
> AI-Enhanced Deliberative Democracy and the Future of the Collective Will
> 
> Abstract This article unpacks...
> 
> Authors:
> 
> Manon Revel1, Meta, FAIR, New York (NYC), United States... Orcid: 0000-0002-8335-946X. mrevel@mit.edu
> 
> Théophile Pénigaud, MacMillan Center, Yale University... Orcid: 0000-0002-1760-8608. theophile.penigaud@yale.edu
> 
> I - Introduction​
> II - Statistical Methods and the Political Public Sphere​
> II. - Polling methods​
> [... full table of contents, 37 section entries ...]"

### What the correct output should be
> Abstract text followed directly by Introduction section body. No author affiliations, no ORCID, no email, no table of contents.

### Source material
The paper uses a journal article LaTeX template with structured `\author{}` blocks containing `\orcid{}`, affiliation blocks, footnotes, and an explicit `\tableofcontents` or similar TOC macro.

### Root cause (if identifiable)
`latex_parser.py:_strip_pre_abstract()` detects the start of real content by looking for `\begin{abstract}`, `\abstract{}`, or `\section{}`. Journal article templates often embed author metadata *after* `\begin{document}` and *before* or *inside* the abstract block in ways the strip logic does not anticipate. The `\orcid{}`, `\affiliation{}`, and author footnote macros are not in the stripping list. The TOC macro (`\tableofcontents`) is stripped but not the literal text it generates if the parser falls through to the PDF path.

---

## Error: Orphaned section reference fragments

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: high — sentence becomes incomprehensible without the referenced section number
**Frequency**: 1/5 papers but 10+ instances within that paper (2312.03893)
**Paper(s)**: 2312.03893

### What the scripter produced
> "focuses on answering this question; starting with a philosophical definition (section ), then building up to something which can be digitally stored (section ) and physically sensed (section )."
> 
> "introduces the idea of an alignment system... (sections -)."

### What the correct output should be
> "focuses on answering this question; starting with a philosophical definition, then building up to something which can be digitally stored and physically sensed."
> 
> (or: elide the section references and connect the prose directly)

### Source material
> `\Cref{sec:will-defined}, then building up to something which can be digitally stored (\Cref{sec:will-signal}) and physically sensed (\Cref{sec:sensing})`

### Root cause (if identifiable)
`latex_parser.py:_strip_citations()` removes the `\Cref{...}` command contents but leaves the surrounding context text intact. The cleanup pass handles "shown in ." and "see ." but not "(section )" nor multi-cref forms like "(sections -)". The parenthetical wrapper and the word "section"/"Figure"/"Table" before the stripped ref are not removed.

---

## Error: Math ordinal suffix rendered as superscript

**Goal**: TTS Readability (Goal 4)
**Severity**: medium — awkward speech output but meaning is recoverable
**Frequency**: 4 instances in 1/5 papers (2602.13920)
**Paper(s)**: 2602.13920

### What the scripter produced
> "posted within the range from 27 to the power of th , January, 2026 to 10 to the power of th , February, 2026"
> 
> "ranging from 25 to the power of th , December, 2025 to 31 to the power of th , December, 2025"

### What the correct output should be
> "posted within the range from January 27th, 2026 to February 10th, 2026"

### Source material
> `from $27^{\text{th}}$, January, 2026 to $10^{\text{th}}$, February, 2026`

### Root cause (if identifiable)
`math_to_speech.py` handles `x^2` → "x squared", `x^T` → "x transpose", and `x^{-1}` → "x inverse", but does not detect ordinal suffixes (th, st, nd, rd). When the superscript content is "th", the fallback path renders it as "to the power of th". Fix: in the superscript handling branch, check if `sup_text in ('th', 'st', 'nd', 'rd')` and if so produce `base + sup_text` (e.g., "27th").

---

## Error: LaTeX diagram annotation spacing string in output

**Goal**: Artifact Cleanliness (Goal 2) + TTS Readability (Goal 4)
**Severity**: medium — confusing/unpronounceable token
**Frequency**: 2 instances in 1/5 papers (2603.23994)
**Paper(s)**: 2603.23994

### What the scripter produced
> "We are given an initial system (1em0.6em) that takes an input and produces an output, and an oracle to give feedback (1em0.6em) that can serve as a signal for optimizing."

### What the correct output should be
> "We are given an initial system that takes an input and produces an output, and an oracle to give feedback that can serve as a signal for optimizing."

### Source material
> `We are given an initial system ($\mathcal{S}$\hspace{1em}\vrule\hspace{0.6em}) that takes...`

The `\hspace{1em}\vrule\hspace{0.6em}` is a diagram separator in the LaTeX source (used to draw a vertical rule between elements in a figure caption or inline diagram). The math `$\mathcal{S}$` is correctly converted to "S" (or dropped), but the spacing commands survive into the output as the literal string `(1em0.6em)`.

### Root cause (if identifiable)
`latex_parser.py` strips `\vspace{}` but not `\hspace{}`. The `\vrule` command is also not stripped. These spacing primitives should be added to the non-prose stripping list in `_strip_non_prose_environments()` or the final cleanup regex.

---

## Error: Orphaned figure reference in parentheses

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: medium — "(figure )" audibly meaningless, disrupts flow
**Frequency**: 7 instances in 1/5 papers (2311.02242)
**Paper(s)**: 2311.02242

### What the scripter produced
> "During each turn of the dialogue, participants are sent either a read-only message (text, image, or video), a poll, or an open-ended prompt that kicks off a collective response process (figure )."
> 
> "two types of evaluations are elicited; agreement votes, and pair choice votes (figure )."

### What the correct output should be
> "...that kicks off a collective response process."
> 
> "two types of evaluations are elicited; agreement votes, and pair choice votes."

### Source material
> `a collective response process (figure~\ref{fig:remesh-dialogue}).`

### Root cause (if identifiable)
`latex_parser.py:_strip_citations()` removes `\ref{...}` and `\autoref{...}` but does not handle the broader `(figure~\ref{...})` pattern. The word "figure" (lowercase) and the parentheses are left as orphans. The cleanup at the end of `_strip_citations()` handles "Figure X" and "Table X" after numeric refs but not the lowercase `(figure )` form. Fix: add a cleanup pass for `\(figure\s*\)` and `\(table\s*\)` and `\(section\s*\)`.

---

## Error: Author metadata leak into narration body

**Goal**: Header/Footer Compliance (Goal 3)
**Severity**: low — jarring but content continues after the artifact
**Frequency**: 1/5 papers (2311.02242)
**Paper(s)**: 2311.02242

### What the scripter produced
> (after abstract):
> "Author contributions: Andrew developed the AI tools used in the process. Andrew, Colin, and Lisa designed and tested the process. Aviv advised on process design and implementation. Everyone contributed to this report.
> 
> Code and data available at:"

### What the correct output should be
These lines should be stripped. They are paper metadata, not part of the narration body.

### Source material
> These appear as `\section*{Author contributions}` or in the body directly after `\begin{abstract}...\end{abstract}`, before the first numbered section.

### Root cause (if identifiable)
The post-abstract stripping logic removes pre-abstract content but does not strip `\section*{Author contributions}` or similar unnumbered metadata sections that appear before the introduction. Add "author contributions" to the stripped section name list alongside "acknowledgments".
