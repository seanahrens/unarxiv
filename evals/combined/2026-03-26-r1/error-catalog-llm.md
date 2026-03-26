# Error Catalog — LLM Tier (commit `214fe70`, pre-cutoff)

Paper evaluated: 2105.05142 (version_id 313, scripter_mode=null)

---

## Error: Massive repetition of DISPLAY_MATH blocks

**Goal**: Fidelity (Goal 1), Artifact Cleanliness (Goal 2)
**Severity**: high
**Frequency**: 1/1
**Paper(s)**: 2105.05142

### What the scripter produced
> The restricted strategy set S super R sub i is the set of all x sub i in nonnegative reals to the power of n such that the sum over all j in V of x sub i j equals 1 and x sub i i is greater than or equal to epsilon

This block (DISPLAY_MATH_011 through DISPLAY_MATH_018) appears 5+ times verbatim across lines 200–303 of the transcript, creating ~100 lines of redundant content.

### What the correct output should be
> Each equation should appear exactly once, in context, with surrounding prose preserved.

### Source material
> LaTeX source `LD_SAGT21.tex` contains each display equation once. The restricted strategy set definition appears in the formal model section (Section 3).

### Root cause
LLM scripter with `scripter_mode=null` processes multi-file LaTeX sources and produces unfiltered mathematical exposition. No deduplication pass exists to catch repeated equation blocks. The LLM likely regenerated the same equation descriptions across multiple sections (model, proofs, discussion) without recognizing they were identical.

---

## Error: LLM refusal message embedded in figure description

**Goal**: Figure/Table Descriptions (Goal 5)
**Severity**: high
**Frequency**: 1/1
**Paper(s)**: 2105.05142

### What the scripter produced
> I cannot provide a detailed description of this figure because no image data is available to analyze. The LaTeX source references a file called 'ExampleLD' but the actual image content is not accessible to me. If you can provide the image file...

### What the correct output should be
> This figure shows an example of a liquid democracy delegation graph, where voters can either vote directly or delegate their voting power to other participants through directed edges.

### Source material
> LaTeX `\includegraphics{ExampleLD}` with caption describing the delegation graph structure.

### Root cause
The LLM was prompted to describe figures but received no image data (only LaTeX source references). Instead of synthesizing a description from the caption and surrounding text, it produced a meta-refusal message. The LLM scripter lacks a fallback to caption-based description when image files are unavailable.

---

## Error: Complete citation dropout (~25 citations)

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: high
**Frequency**: 1/1
**Paper(s)**: 2105.05142

### What the scripter produced
> sparked by the Pirate Party in Germany and its Liquid Feedback platform.

### What the correct output should be
> sparked by the Pirate Party in Germany and its Liquid Feedback platform, as described by Behrens and others.

### Source material
> LaTeX: `sparked by the Pirate Party in Germany and its Liquid Feedback platform~\cite{BKN14}`
> Multiple other citations: `\cite{Beh17, BKN14, BZ16, For02, GA15}`, `\cite{EGP19}`, etc.

### Root cause
LLM scripter with `scripter_mode=null` strips all `\cite{}` commands without converting them to author-year prose. No citation resolution step exists to look up BibTeX entries and substitute readable author names.

---

## Error: Missing article in grammatical construction

**Goal**: Fidelity (Goal 1)
**Severity**: medium
**Frequency**: 1/1
**Paper(s)**: 2105.05142

### What the scripter produced
> We have introduced general game theoretic model for liquid democracy.

### What the correct output should be
> We have introduced a general game-theoretic model for liquid democracy.

### Source material
> LaTeX conclusion section, line 149: "We have introduced a general game theoretic model for liquid democracy."

### Root cause
LLM rewriting introduced a grammatical error by dropping the indefinite article "a". This suggests the LLM is paraphrasing rather than preserving near-verbatim fidelity, violating Goal 1.

---

## Error: Awkward epsilon-Nash spacing

**Goal**: TTS Readability (Goal 4)
**Severity**: medium
**Frequency**: 1/1
**Paper(s)**: 2105.05142

### What the scripter produced
> epsilon -Nash equilibrium

### What the correct output should be
> epsilon-Nash equilibrium

### Source material
> LaTeX: `$\epsilon$-Nash equilibrium`

### Root cause
Math symbol extraction adds a space before the hyphen when converting `$\epsilon$` to text, creating an unnatural pause in TTS output. The hyphen should be treated as part of a compound term, not as a mathematical operator.

---

## Error: Extremely verbose math-to-speech rendering

**Goal**: TTS Readability (Goal 4)
**Severity**: medium
**Frequency**: 1/1
**Paper(s)**: 2105.05142

### What the scripter produced
> the sum from r equals one to N of n sub i r times the quantity one minus the quantity r minus one divided by N minus one

### What the correct output should be
> the sum from r equals 1 to N of n-i-r times the quantity 1 minus r minus 1 over N minus 1

Or better: a simplified verbal description of what the formula computes, rather than a mechanical symbol-by-symbol reading.

### Source material
> LaTeX display math equation for the scoring rule in the delegation game model.

### Root cause
LLM scripter performs mechanical symbol-by-symbol translation of complex equations rather than providing semantic summaries. No heuristic exists to detect when an equation is too complex for verbatim speech rendering and should instead be summarized ("This formula computes the expected utility based on delegation weights...").
