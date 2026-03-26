# Error Catalog — Hybrid Scripter (commit `569cb05`)

Eval date: 2026-03-26 | Papers evaluated: 5 (2512.03399, 2301.09976, 2404.10636, 2411.09222, 2411.10534)

---

## Error: Citation trailing preposition — dangling "by, and others"

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: high — grammatically broken sentence; listener hears unintelligible attribution
**Frequency**: 1/5 papers (3 occurrences within that paper)
**Paper(s)**: 2404.10636
**Status**: ⚠️ DEFERRED — requires syntactic detection of preposition-cite sequences; existing `"by, and others"` → `"by others"` cleanup in `_strip_citations()` catches some cases but not the multi-author form

### What the scripter produced
> "our approach is inspired by the philosophy of values advanced by, and others"

### What the correct output should be
> "our approach is inspired by the philosophy of values advanced by Taylor and Chang, and others"
> (or similar author-year form, e.g., "Taylor 1977 and Chang 2004")

### Source material
> `our approach is inspired by the philosophy of values advanced by \cite{Taylor1977}, \cite{Chang2004}, and others`

### Root cause (if identifiable)
The hybrid scripter (or underlying regex pipeline) strips `\cite{...}` commands entirely without substituting author names or year numbers. When a `\cite` is the grammatical object of a preposition (`"advanced by \cite{...}"`), removal leaves `"advanced by,"` which is grammatically broken. Fix: when stripping `\cite{}`, check if the citation is a preposition complement and insert at minimum `"[author]"` or the citation key reformatted as prose (e.g., `"Taylor 1977"`). The `element_extractor.py` should detect preposition-cite sequences.

---

## Error: Footnote content omitted — co-alignment definition

**Goal**: Near-Verbatim Fidelity (Goal 1)
**Severity**: medium — material definitional content omitted
**Frequency**: 1/5 papers
**Paper(s)**: 2512.03399

### What the scripter produced
> (no mention of co-alignment footnote definition in the transcript)

### What the correct output should be
> "By co-alignment we mean roughly 'align at the same time.'"

### Source material
> LaTeX footnote: `\footnote{By co-alignment we mean roughly ``align at the same time.''}`

### Root cause (if identifiable)
The hybrid scripter strips `\footnote{}` content entirely. Short definitional footnotes (under ~50 words) should be inlined at their call site. The `element_extractor.py` currently does not distinguish between bibliographic footnotes (should be dropped) and definitional footnotes (should be retained). A heuristic: if a footnote is `< 80 chars` and contains no `\cite`, inline it.

---

## Error: Video UI metadata in figure description

**Goal**: Figure/Table Descriptions (Goal 5)
**Severity**: medium — irrelevant metadata confuses listeners
**Frequency**: 1/5 papers
**Paper(s)**: 2301.09976

### What the scripter produced
> "The video is at 12 minutes and 37 seconds"

### What the correct output should be
> (omit temporal metadata; describe the static figure content only)

### Source material
> A figure showing a video player interface screenshot. The timestamp `12:37` appears in the video player UI element, not as paper content.

### Root cause (if identifiable)
`llm_describer.py` describes all visible elements in a figure image, including UI chrome (play buttons, timestamps, progress bars). The LLM prompt should instruct it to describe only paper-relevant content and ignore UI decoration. Add to the describer prompt: "Ignore timestamps, play buttons, or navigation UI in video/browser screenshots."

---

## Error: Technical term not expanded on first mention

**Goal**: TTS Readability (Goal 4)
**Severity**: medium — listeners unfamiliar with the term may be confused
**Frequency**: 1/5 papers
**Paper(s)**: 2301.09976

### What the scripter produced
> "…including mini-publics, citizens' assemblies…" (first use, no expansion)

### What the correct output should be
> "…including mini-publics — small convened groups of diverse citizens — citizens' assemblies…"

### Source material
> LaTeX provides a parenthetical definition shortly after: `\textit{mini-publics} (the convening of a diverse group of people to deliberate)`

### Root cause (if identifiable)
The hybrid scripter preserves parenthetical definitions when they immediately follow the term, but this source places the definition two sentences later. `element_extractor.py` does not scan ahead for deferred definitions. A fix would be to collect all `\textit{term}` + definition pairs and inject the definition at first occurrence if it appears within 3 sentences.

---

## Error: Domain name spelled out with spurious period

**Goal**: TTS Readability (Goal 4)
**Severity**: low — audible but not meaning-altering
**Frequency**: 1/5 papers (consistent with regex tier issue)
**Paper(s)**: 2411.10534
**Status**: ✅ FIXED — `628cec3` changes footer to "Narrated by unarxiv dot org." in `script_builder.py` (shared by all tiers)

### What the scripter produced
> "un. archive dot org"

### What the correct output should be
> "unarxiv dot org" (or simply "unarxiv.org" which TTS handles correctly)

### Source material
> Attribution footer injected by `script_builder.py`, not from LaTeX source.

### Root cause (if identifiable)
Same as regex tier: footer template renders `unarxiv.org` in a way that causes TTS normalization to split at the period. The string `"un."` followed by `"archive dot org"` suggests the domain was decomposed incorrectly. Fix the footer template to use `"unarxiv dot org"` or test that the TTS engine handles the domain form correctly.

---

## Error: Source-level typo propagated to transcript

**Goal**: Near-Verbatim Fidelity (Goal 1)
**Severity**: low — error is in source, not a scripter bug; correct behavior
**Frequency**: 1/5 papers
**Paper(s)**: 2512.03399

### What the scripter produced
> "amplifed" (missing 'i')

### What the correct output should be
> "amplified"

### Source material
> LaTeX source line ~282: `amplifed` (typo in original paper)

### Root cause (if identifiable)
Not a scripter bug. The source LaTeX contains a misspelling. The hybrid scripter correctly preserves the source verbatim. However, the scripter could optionally run a spellcheck pass on output and flag or auto-correct clear single-character typos. Low priority.
