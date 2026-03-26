# Error Catalog — LLM (plus1) Tier

**Evaluation run:** 2026-03-26-r3
**Commit:** `1175bd7`
**Model:** claude-haiku-4-5-20251001
**Papers evaluated:** 2312.03893, 2603.23994, 2311.02242, 2602.13920

---

## Error: Chunk truncation — mid-word content cutoff

**Goal:** Near-Verbatim Fidelity (Goal 1)
**Severity:** high
**Frequency:** 1/4 papers (2312.03893)
**Paper(s):** 2312.03893

### What the scripter produced
```
Symbiotic Improvement of AI and Alignment Systems.

Symbiotic advantage. [...full paragraph...]

 Weak symbiotic improvemen

Thanks for listening. This has been an audio narration of...
```
The section "Weak symbiotic improvement" is cut mid-word at "improvemen" — the "t" and all subsequent content is missing. The footer follows immediately.

### What the correct output should be
The full "Weak symbiotic improvement" subsection should be narrated before the footer.

### Source material
```latex
\subsection{Weak symbiotic improvement}
...full subsection text...
```

### Root cause (if identifiable)
The LLM chunk containing the end of this paper was likely truncated at a token limit. The `llm_scripter.py` chunk assembly appends the footer after the last processed chunk, so if the final chunk was truncated before being written, the footer still appears immediately after the truncated content. Possible causes: (a) the chunk exceeded the model's max output tokens, (b) an API timeout was swallowed, or (c) a bug in chunk boundary detection caused content to be skipped. Fix: add length validation for each chunk output; if a chunk ends mid-sentence, log a warning and attempt retry or fallback.

---

## Error: Orphaned section references "(section )" in LLM output

**Goal:** Artifact Cleanliness (Goal 2)
**Severity:** high
**Frequency:** 2/4 papers (2312.03893 strongly, likely others with cross-refs)
**Paper(s):** 2312.03893

### What the scripter produced
> "starts with a philosophical definition (section ), then building up to something which can be digitally stored (section ) and physically sensed (section )."

> "frames alignment as being between the future and the will of humanity (section ), then introduces the idea of an alignment system as a general class of system (sections -)."

6 such lines in the "How to read this document" section alone.

### What the correct output should be
Options: (a) strip the parenthetical entirely: "starts with a philosophical definition, then building up to something which can be digitally stored and physically sensed." (b) describe the section by name: "starts with a philosophical definition (described in the Will of Humanity section)."

### Source material
```latex
(see Section~\ref{sec:will})
```
The LaTeX `\ref{}` cannot be resolved without compiling, so the output is "(section )".

### Root cause (if identifiable)
The LLM receives chunks with `\ref{...}` still present in source. The LLM expands the parenthetical to "(section )" because it cannot resolve the label. The `latex_post_process.py` module does not strip these residual `(section )` forms. The 628cec3 fix added cleanup in `latex_parser.py` for the regex tier; an equivalent cleanup pass should be added to `latex_post_process.py`. Fix: add a post-processing step that removes `\s*\(section\s*\)\s*`, `\(sections\s*-\s*\)`, `\(figure\s*\)`, `\(table\s*\)` patterns.

---

## Error: Orphaned figure reference "(figure )" coexisting with figure description

**Goal:** Artifact Cleanliness (Goal 2)
**Severity:** medium
**Frequency:** 2/4 papers (2311.02242 has 7+ instances; 2312.03893 has some)
**Paper(s):** 2311.02242, 2312.03893

### What the scripter produced
```
...that kicks off a collective response process (figure ). During a collective response process...

[...later in the same transcript...]

This figure shows three screenshots labeled A, B, and C that depict the participatory steps
in a collective dialogue process on the Remesh platform...
```
The `(figure )` inline ref appears in the prose, AND a separate detailed figure description exists later. Both coexist.

### What the correct output should be
The `(figure )` orphan should be stripped from the prose. The figure description should be retained.

### Source material
```latex
collective response process (see Figure~\ref{fig:process}). During...
...
\begin{figure}
  \caption{Participatory steps in a collective dialogue process.}
\end{figure}
```

### Root cause (if identifiable)
The LLM produces the figure description when it processes the `\begin{figure}` block, and also preserves the inline `(figure )` ref in the prose chunk because the `\ref{}` was not resolved. Both end up in the output. `latex_post_process.py` should strip `(figure )`, `(table )`, `(figure~)` inline refs after LLM processing. See fix for section refs above.

---

## Error: (1em0.6em) LaTeX spacing artifact

**Goal:** TTS Readability (Goal 4)
**Severity:** medium
**Frequency:** 1/4 papers evaluated (2603.23994); likely in any paper using `\hspace{}\vrule` diagram notation
**Paper(s):** 2603.23994

### What the scripter produced
> "we are given an initial system (1em0.6em) that takes an input and produces an output, and an oracle to give feedback (1em0.6em) that can serve as a signal for optimizing."

### What the correct output should be
> "we are given an initial system that takes an input and produces an output, and an oracle to give feedback that can serve as a signal for optimizing."

### Source material
```latex
We are given an initial system $\hspace{1em}\rule{0.6em}{0.6em}$ that takes...
```
The `\hspace{1em}\vrule\hspace{0.6em}` is a diagram annotation (visual separator in a figure inline) being rendered as "(1em0.6em)".

### Root cause (if identifiable)
The 628cec3 fix applied to `latex_parser.py` (regex tier) removes these `\hspace{}/\vrule` patterns. The LLM preprocessor (`llm_scripter.py` source prep or `latex_post_process.py`) does not apply the same strip. The LLM sees the raw `\hspace{1em}\rule{0.6em}{}` and outputs "(1em0.6em)" literally. Fix: apply the same `\hspace{}/\vrule` stripping to the LLM source preprocessing before chunking.

---

## Error: Ordinal superscript "N to the power of th" rendering

**Goal:** TTS Readability (Goal 4)
**Severity:** medium
**Frequency:** 1/4 papers evaluated (2602.13920); confirmed fixed in regex tier by 628cec3
**Paper(s):** 2602.13920

### What the scripter produced
> "within the range from 27 to the power of th , January, 2026 to 10 to the power of th , February, 2026"
> "ranging from 25 to the power of th , December, 2025 to 31 to the power of th , December, 2025"

### What the correct output should be
> "within the range from 27th January 2026 to 10th February 2026"

### Source material
```latex
$27^{\text{th}}$ January, 2026
```

### Root cause (if identifiable)
The 628cec3 commit fixed ordinal superscript detection in `math_to_speech.py` for the regex tier. The LLM tier does not use `math_to_speech.py` — it sends raw LaTeX to the LLM and receives the output. The LLM interprets `$27^{\text{th}}$` as a math expression and writes "27 to the power of th". Fix: (a) pre-process ordinal patterns before sending to LLM: replace `$N^{\text{th}}$` → `Nth`, or (b) add an instruction in the LLM system prompt to convert ordinal superscripts to cardinal+suffix (e.g., "27th").

---

## Error: Hanging sentence from figure reference in subject position

**Goal:** Artifact Cleanliness (Goal 2)
**Severity:** medium
**Frequency:** 1/4 papers (2602.13920); likely in any paper where `\ref{}` is the grammatical subject of a sentence
**Paper(s):** 2602.13920

### What the scripter produced
> "illustrates the data schema of Moltbook data."

A sentence with no grammatical subject.

### What the correct output should be
This sentence should be stripped entirely, or the subject reconstructed: "The schema diagram illustrates the data schema of Moltbook data."

### Source material
```latex
Figure~\ref{fig:schema} illustrates the data schema of Moltbook data.
```
After stripping `Figure~\ref{fig:schema}`, only the predicate remains.

### Root cause (if identifiable)
When `\ref{}` labels are stripped from subject position, the remaining predicate verb phrase creates a grammatically broken sentence. The 628cec3 cleanup targeted parenthetical `(figure )` forms but not subject-position `Figure~\ref{}` patterns. Fix: add a regex cleanup in `latex_post_process.py` matching `^(?:Figure|Table|Section|Algorithm)\s+[0-9.]* ?(?:shows|illustrates|depicts|displays|presents|summarizes|lists|compares|provides|gives|plots|demonstrates)` and either strip or reconstruct the sentence.

---

## Error: LLM footer uses old domain name "un. archive dot org"

**Goal:** Header/Footer Compliance (Goal 3)
**Severity:** low
**Frequency:** 4/4 papers
**Paper(s):** 2312.03893, 2603.23994, 2311.02242, 2602.13920

### What the scripter produced
> "Narrated by un. archive dot org, an app made by Sean Ahrens and Claude."

### What the correct output should be
> "Narrated by unarxiv dot org."

### Root cause (if identifiable)
The 628cec3 commit fixed the footer in `regex_scripter/script_builder.py` but the LLM tier constructs its footer in a different location (likely in `llm_scripter.py` or `tts_utils.py`). Fix: update the footer template in `llm_scripter.py` (and `hybrid_scripter/__init__.py`) to match the corrected string.
