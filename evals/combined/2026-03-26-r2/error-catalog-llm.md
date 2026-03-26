# Error Catalog — LLM Scripter (claude-haiku-4-5-20251001, commit `1175bd7`)

Eval date: 2026-03-26 | Papers evaluated: 5 (2312.03893, 2603.23994, 2311.02242, 2602.13920, 2403.10433)

---

## Error: Orphaned section reference fragments (inherited from source preprocessing)

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: high — sentences become incomprehensible
**Frequency**: 2/5 papers (2312.03893, 2311.02242)
**Paper(s)**: 2312.03893, 2311.02242

### What the scripter produced
> (2312.03893, line 35): "focuses on answering this question; starting with a philosophical definition (section ), then building up to something which can be digitally stored (section ) and physically sensed (section )."
> 
> (2311.02242, 7 instances): "kicks off a collective response process (figure )."

### What the correct output should be
> "focuses on answering this question; starting with a philosophical definition, then building up to something which can be digitally stored and physically sensed."
> 
> "kicks off a collective response process."

### Source material
> `\Cref{sec:...}`, `(figure~\ref{fig:...})`

### Root cause (if identifiable)
The LLM scripter passes LaTeX source chunks to the model with macros but not with pre-stripped cross-references. The system prompt does not instruct the LLM to remove `(figure )` / `(section )` orphans. Additionally, `latex_post_process.py` handles `\ref{...}` but does not detect the residual orphan text left after stripping. The LLM itself also does not clean these up.

Fix: In `latex_post_process.py`, add patterns:
- `r'\(figure\s*\)'` → `''`
- `r'\(table\s*\)'` → `''`
- `r'\(section\s*\)'` → `''`
- `r'\(sections?\s*[-–]\s*\)'` → `''`

---

## Error: Orphaned figure reference coexisting with inserted figure description

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: medium — "(figure )" orphan appears in prose even though a description was inserted
**Frequency**: 1/5 papers, 7 instances (2311.02242)
**Paper(s)**: 2311.02242

### What the scripter produced
> [inserted description]: "This diagram illustrates the structure of a collective dialogue system..."
> 
> [then, in surrounding prose]: "During each turn of the dialogue, participants are sent... an open-ended prompt that kicks off a collective response process (figure )."

### What the correct output should be
The `(figure )` orphan in the prose should be removed even when a figure description has been inserted at that position.

### Root cause (if identifiable)
The hybrid element extraction + LLM description insertion pipeline removes the figure environment (e.g., `\begin{figure}...\end{figure}`) and replaces it with the description, but does not clean up `\ref{fig:...}` cross-references in the surrounding prose. These are two separate operations and neither cleans the other's artifacts.

---

## Error: Math ordinal suffix rendered as superscript (shared with regex)

**Goal**: TTS Readability (Goal 4)
**Severity**: medium — awkward phrasing
**Frequency**: 4 instances in 1/5 papers (2602.13920)
**Paper(s)**: 2602.13920

### What the scripter produced
> "posted within the range from 27 to the power of th , January, 2026"

### What the correct output should be
> "posted within the range from January 27th, 2026"

### Source material
> `$27^{\text{th}}$, January, 2026`

### Root cause (if identifiable)
Identical to regex: this artifact survives from the source preprocessing stage (`math_to_speech.py`) before the LLM ever sees the text. The math chunk is converted to "27 to the power of th" by the regex engine and fed into the LLM prompt as-is. The LLM does not correct this.

Fix: Same as regex — detect ordinal suffixes in `math_to_speech.py` superscript handler.

---

## Error: LaTeX diagram annotation spacing string (shared with regex)

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: medium — confusing token "(1em0.6em)" appears in output
**Frequency**: 2 instances in 1/5 papers (2603.23994)
**Paper(s)**: 2603.23994

### What the scripter produced
> "We are given an initial system (1em0.6em) that takes an input and produces an output, and an oracle to give feedback (1em0.6em)"

### What the correct output should be
> "We are given an initial system that takes an input and produces an output, and an oracle to give feedback"

### Source material
> `\hspace{1em}\vrule\hspace{0.6em}` — diagram spacer passed through source preprocessing intact and then into the LLM chunk prompt. The LLM reproduces it verbatim.

### Root cause (if identifiable)
`\hspace{}` and `\vrule` are not stripped in the regex pre-processing stage. Since the artifact appears in source before chunking, the LLM receives it and outputs it unchanged. Fix: strip `\hspace{...}`, `\vspace{...}`, `\vrule`, `\hrule` in `latex_parser.py` or in the LLM scripter's pre-chunk cleanup.

---

## Error: Author metadata leak (inherited from source preprocessing)

**Goal**: Header/Footer Compliance (Goal 3)
**Severity**: low — metadata appears in body but content continues normally
**Frequency**: 1/5 papers (2311.02242)
**Paper(s)**: 2311.02242

### What the scripter produced
> (after abstract): "Author contributions: Andrew developed the AI tools used in the process..."
> 
> "Code and data available at:"

### What the correct output should be
These lines should be omitted from the narration.

### Source material
`\section*{Author contributions}` or similar post-abstract metadata block.

### Root cause (if identifiable)
Same as regex: post-abstract stripping does not include "Author contributions" as a stripped section name. Since the LLM receives this in the chunk covering the abstract/introduction, it includes it in the narration.
