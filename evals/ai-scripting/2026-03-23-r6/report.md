# LLM Script Evaluation Report — 2026-03-23 (Round 6)

## Context

This is **Round 6** of the unarXiv LLM narration pipeline evaluation.

**Cutoff commit**: `d160712a` — `eval(round5): fix raw LaTeX math output, sparse-section meta-commentary` (2026-03-23 13:08:54 -0600)
**Cutoff timestamp**: 2026-03-23 19:08:54 UTC

Two production narration versions exist in the database after this cutoff, both generated using `openai/gpt-4o`, tier `plus1`:

| Paper | arXiv ID | Created |
|-------|---------|---------|
| BEAVER: A Training-Free Hierarchical Prompt Compression Method | 2603.19635 | 2026-03-23 22:02:30 |
| WorldAgents: Can Foundation Image Models be Agents for 3D World Models? | 2603.19708 | 2026-03-23 21:58:39 |

---

## Executive Summary

| Paper | Goal 1 Fidelity | Goal 2 Citations | Goal 3 Header | Goal 4 Figures | Goal 5 TTS | Total |
|-------|----------------|-----------------|---------------|----------------|-----------|-------|
| 2603.19635 BEAVER | 6/10 | 9/10 | 7/10 | 8/10 | 5/10 | **35/50** |
| 2603.19708 WorldAgents | 6/10 | 9/10 | 9/10 | 8/10 | 8/10 | **40/50** |

**Round 6 average: 37.5/50**

### Round-over-Round Progress

| Eval | Avg Score | Key Issues |
|------|-----------|------------|
| Round 1 (03-22) | 26/50 | Refusals, macros, paraphrasing, section framing, caption-only figures |
| Round 2 (03-22) | 32/50 | Duplicate author blocks, podcast openers, figure refusals |
| Round 3 (03-23) | 41/50 | Shallow figure descriptions, URL letter-spelling, formatting narration |
| Round 5 (03-23) | 38/50 | Raw LaTeX math (new), sparse-section meta-commentary (persistent) |
| Round 6 (03-23) | **37.5/50** | **Macro non-expansion (new), template bleed-through (new), abstract meta-wrapper (new), section outros (persistent)** |

**Round 6 is effectively flat versus Round 5.** Paper 1's TTS score is dragged down by unresolved `\ours` macro passthrough. Paper 2 shows the raw LaTeX math fix from Round 5 worked, but new issues emerged.

### New Issues (Round 6)

1. **NEW: Custom macro non-expansion** — Paper 1 (BEAVER) defines `\newcommand{\ours}{\text{BEAVER}\xspace}` in the preamble. After preamble stripping, the LLM never sees this definition. As a result, `\ours` appears in the output both as `\ours` (literal LaTeX) and as `"ours"` in quotes. A TTS engine reads `\ours` as "backslash ours." **Root cause: code-level — the preamble is stripped before the LLM sees it, removing `\newcommand` definitions.**

2. **NEW: LaTeX template boilerplate bleed-through** — Paper 1 (BEAVER) uses the ACL LaTeX template, which includes a sample section with placeholder content (Hindi/Arabic multilingual examples, dummy citations, and "This is an appendix"). The LLM naively narrates this placeholder as if it were real paper content (lines 269–275). A listener hears "Maanav Adhikaaron kee Saarvabhaum Ghoshana" and "This is an appendix" — nonsense in this context.

3. **NEW: Abstract narrated in third person** — Paper 2 (WorldAgents) narrates the abstract as "The abstract begins with a question regarding the nature of two-dimensional foundation image models. Specifically, it asks whether..." rather than reading the abstract text directly. The LLM inserted a meta-wrapper around the abstract content, framing it as an object to describe rather than text to read aloud.

4. **PERSISTENT: Section outros (Rounds 2, 3, 5, 6)** — Paper 1 (BEAVER) has three "This concludes the X section." sentences: line 31 ("This concludes the introduction section."), line 85 ("This concludes the detailed description and analysis..."), and line 193 ("This concludes the description of the datasets section."). Round 5 updated the prohibition in guideline 5, but GPT-4o is still generating these.

### Confirmed Fixes from Round 5

- **Raw LaTeX math delimiters**: Paper 2 (WorldAgents) has a heavily math-laden methodology section with equations for camera poses, verification functions, etc. — all are correctly verbalized in spoken English. The `_strip_latex_math_delimiters()` post-processing and strengthened guideline 3 are working.
- **Sparse-section meta-commentary**: No occurrences of "There is no content here" or "This section contains only a heading" in either paper. Fix from Round 5 confirmed working.
- **Section heading standalone narration**: Neither paper shows "The section is titled 'X'" patterns. Fix from Round 5 confirmed working.

---

## Paper 1: BEAVER (2603.19635)

**Title**: BEAVER: A Training-Free Hierarchical Prompt Compression Method via Structure-Aware Page Selection
**Authors**: Zhengpei Hu, Kai Li, Dapeng Fu, and 4 more authors
**Published**: March 20, 2026
**LLM**: openai/gpt-4o, tier=plus1
**Script length**: 276 lines | **LaTeX length**: long (ACL multi-section paper)

### Score Table

| Goal | Score | Key Finding |
|------|-------|-------------|
| Goal 1: Fidelity | 6/10 | Mostly verbatim; macro non-expansion corrupts paper name; template bleed-through at end; section outros |
| Goal 2: Citations | 9/10 | No raw `[n]` markers; minor: cross-references stated as "referenced as X" |
| Goal 3: Header/Footer | 7/10 | Standard header/footer OK; three "This concludes..." outros |
| Goal 4: Figures | 8/10 | Excellent: latency chart and tables described with specific numbers throughout |
| Goal 5: TTS | 5/10 | `\ours` appears as literal `\ours` in 15+ lines; template placeholder content narrated |

### Goal 1 — Fidelity: 6/10

**What's working**: Math equations well verbalized (ITF formulas, pooling equations in lines 57–72). Content is largely preserved paragraph-by-paragraph. Table data (ablation study, Table 1 line 139ff) is narrated with specific numbers.

**Critical failure — macro non-expansion**:

Source preamble:
```
\newcommand{\ours}{\text{BEAVER}\xspace}
```

Expected in narration: "BEAVER"

Actual script:
- Lines 7–11: `"ours"` in quotes throughout the abstract — the LLM used the macro name as a word.
- Lines 25, 27, 41: `\ours` literal — e.g., "we propose a novel training-free framework called `\ours`"
- Lines 89, 95, 97, 137, 139, 163–169: Mix of `"ours"` and `\ours`

This makes the paper's key concept (the BEAVER system) unnamed throughout most of the narration. Line 207 is the only place where "BEAVER" appears correctly (from figure text).

**Section outros (three occurrences)**:
- Line 31: "This concludes the introduction section."
- Line 85: "This concludes the detailed description and analysis of the Query Planner's methods and performance data across different benchmarks and scenarios."
- Line 193: "This concludes the description of the datasets section."

All explicitly prohibited by guideline 5.

**Template bleed-through** (lines 269–275):
> "Moving on to the introduction. Please see the general instructions in the file called acl underscore latex dot tex. The authors provide some examples of text in various languages. In Hindi, the phrase is pronounced 'Maanav Adhikaaron kee Saarvabhaum Ghoshana,' which translates to the Universal Declaration of Human Rights..."
> "This is an appendix."

This is the ACL LaTeX template's example text — standard boilerplate that appears at the end of the template file. It is not part of the paper and should never be narrated.

### Goal 2 — Citations: 9/10

No `[1]`, `\cite{}`, or raw citation markers. Minor: cross-reference patterns appear as "referenced as Figure 5" or "detailed in Table two referring to the main results on RULER" — acceptable circumlocutions for `\ref{}` commands.

### Goal 3 — Header/Footer: 7/10

Standard header (title, authors, date) and footer are correct. Three "This concludes..." section outros are violations.

### Goal 4 — Figures: 8/10

**Figure 5 (latency chart)**, lines 119–127:
> "This figure is a line plot illustrating the latency in milliseconds on the vertical axis against the context length on the horizontal axis. Four different methods are represented: LongLLMLingua, LLMLingua2, LLMLingua2-small, and ours, marked by red circles, blue squares, orange triangles, and green diamonds, respectively. At a 16,000-token context length, LongLLMLingua shows a latency of approximately 3,882 milliseconds..."

Specific data points, color coding, visual layout all described. Gold standard performance.

**Table 1 ablation study** (lines 131–145): all specific scores and performance drops named correctly.

Minor deduction: Figure 1 described as "a comprehensive flowchart" but visual layout is thin.

### Goal 5 — TTS: 5/10

**Critical failure — `\ours` as literal LaTeX macro**:

Lines 25, 27, 41, 89, 95, 97, 137, 139, 163, 165, 167, 169 — the macro appears as `\ours` in the text. A TTS engine reads this as "backslash ours."

**Template bleed** (lines 269–275): TTS engine reading "acl underscore latex dot tex" and transliterated Hindi would produce unlistenable output.

**What's working**: Math verbalization is correct throughout. No raw LaTeX math delimiters. Citation removal is clean.

---

## Paper 2: WorldAgents (2603.19708)

**Title**: WorldAgents: Can Foundation Image Models be Agents for 3D World Models?
**Authors**: Ziya Erkoç, Angela Dai, and Matthias Nießner
**Published**: March 20, 2026
**LLM**: openai/gpt-4o, tier=plus1
**Script length**: 189 lines

### Score Table

| Goal | Score | Key Finding |
|------|-------|-------------|
| Goal 1: Fidelity | 6/10 | Abstract narrated in third person; otherwise largely verbatim |
| Goal 2: Citations | 9/10 | Clean; minor `~ref~` artifacts |
| Goal 3: Header/Footer | 9/10 | Standard header/footer correct; no outros |
| Goal 4: Figures | 8/10 | Table 1 with all specific data; figure descriptions use visual detail |
| Goal 5: TTS | 8/10 | Math well verbalized; two `~ref~` TTS artifacts |

### Goal 1 — Fidelity: 6/10

**Critical failure — abstract narrated in third person**:

Source abstract (opening): "In this paper, we investigate whether 2D foundation image models inherently possess the capabilities to understand and model a 3D world."

Script lines 7–11:
> "The abstract begins with a question regarding the nature of two-dimensional foundation image models. Specifically, it asks whether these models inherently possess the capabilities to understand and model a three-dimensional world. To explore this, the authors systematically evaluate..."

The LLM wrapped the abstract in a meta-description ("The abstract begins with...") rather than narrating it as written. The authors wrote "we investigate" — a first-person claim. The script says "the authors systematically evaluate" — a third-person description. Both the voice and the meaning are changed.

**What's working**: The methodology, experiments, and conclusion sections (lines 43–164) are near-verbatim with correct math verbalization.

### Goal 2 — Citations: 9/10

Clean citation stripping. Minor: lines 146, 148 contain `~ref~` artifacts:
- "Figure two, referred to as Figure~ref~ablation~qual"
- "Table one, referred to as Table~ref~ablation~comp~quant"

### Goal 3 — Header/Footer: 9/10

Standard header (title, authors, date) and footer correct. No section outros. Only deduction: the abstract meta-wrapper changes the opening register.

### Goal 4 — Figures: 8/10

**Table 1 comparison** (lines 131–141): all seven table rows with CLIP Score, Inception Score, and CLIP-IQA values explicitly named. Excellent.

**Figure 1 (method overview)**, line 51: good structural description of the Director-Generator-Verifier pipeline.

Minor: Figure 4 (lines 172–174) described thinly.

### Goal 5 — TTS: 8/10

Math-heavy methodology section (lines 53–99) is well-handled. Camera pose formulas, verification functions verbalized correctly.

Minor failures:
- Lines 146, 148: `~ref~` artifacts — TTS would read "tilde ref tilde ablation tilde qual"

---

## Cross-Paper Patterns (Round 6)

### Pattern 1: Custom macro non-expansion — NEW, STRUCTURAL

Paper 1's `\ours` macro is defined in the LaTeX preamble, which is stripped by `_strip_latex_preamble()` before chunking. The LLM never sees `\newcommand{\ours}{\text{BEAVER}\xspace}`. When it encounters `\ours` in text, it either passes it through as literal `\ours` or interprets it generically as "ours".

**Root cause**: Code-level structural bug. The `\newcommand` definitions live in the preamble, but the preamble is stripped before LLM processing. No amount of prompt instruction can fix this since the LLM has no access to the definitions.

### Pattern 2: Section outros — PERSISTENT (Rounds 2, 3, 5, 6)

Paper 1 shows three section-ending phrases. The Round 5 fix prohibited "This concludes the section" but GPT-4o generates variants like "This concludes the detailed description and analysis of..." which technically differ from the prohibited phrasing.

### Pattern 3: Abstract narrated in third person — NEW

Paper 2's abstract is wrapped in a meta-description. GPT-4o's "helpful assistant" tendency contextualizes content for the reader rather than reading it verbatim.

### Pattern 4: Template boilerplate narration — NEW, STRUCTURAL

The ACL template includes sample/example text at the document tail. `_strip_latex_preamble()` only removes content *before* `\begin{abstract}`, leaving template examples at the document tail intact.

### Pattern 5: Raw `\ref{}` passthrough — MINOR

Two `~ref~` artifacts in Paper 2. The `_strip_latex_math_delimiters` function doesn't handle `\ref{}` commands.

---

## Provider / Model Assessment

**Current model**: openai/gpt-4o (user-selected)

Section outros have now persisted through **4 consecutive rounds** (2, 3, 5, 6) despite targeted prompt fixes each round. The abstract meta-wrapper (Paper 2) is the same class of failure: GPT-4o contextualizes content for the listener instead of reading it as instructed.

**Assessment**: GPT-4o has a persistent edge-case failure mode (section outros, meta-contextualization) that repeated prompt tuning has not resolved. The structural issues (macro non-expansion, template bleed) are code-level and not model-specific. Claude Sonnet 4.6 would likely show better structured-output compliance and less "helpful assistant" wrapping behavior, but since the provider is user-selected, we focus on prompt and code improvements.

The Round 5 report recommended updating `DEFAULT_MODELS.llm.anthropic` from `claude-3-5-haiku-20241022` to `claude-sonnet-4-6`. This should be verified and implemented.

---

## Recommended Fixes (Implemented in this round)

### Fix 1 (CRITICAL, Code): Macro extraction and injection

Extract `\newcommand` definitions from the full source before preamble stripping and inject them into each chunk's user message as a prefix note.

### Fix 2 (HIGH, Prompt): Stronger section outro prohibition

Extend prohibition to catch all variants: "NEVER begin a sentence with 'This concludes...' or 'This ends...' or 'This wraps up...'"

### Fix 3 (HIGH, Prompt): Explicit instruction against abstract meta-wrapping

"Narrate ALL content as the authors' own words — do NOT describe content in third person ('The abstract begins with...', 'The authors state...')."

### Fix 4 (MEDIUM, Code): Strip `\ref{}` and `~ref~` artifacts in post-processing

Add `\ref{...}` and tilde-separated ref patterns to the post-processing cleanup.

### Fix 5 (MEDIUM, Code): Strip `\end{document}` tail

Strip everything after `\end{document}` to eliminate template boilerplate that appears in the document tail.

---

## Summary of Issue Status (Round 6)

| Issue | Status |
|-------|--------|
| LLM refusal mode | ELIMINATED |
| Per-section framing ("Welcome to...", "This concludes...") | **PERSISTENT** (4 rounds) |
| Duplicate author block injection | ELIMINATED |
| Podcast-host opener | ELIMINATED |
| Editorial adjectives | ELIMINATED |
| Raw LaTeX math delimiters | **FIXED** (Round 5) |
| Chatbot meta-commentary on sparse sections | **FIXED** (Round 5) |
| Section heading narrated as standalone line | **FIXED** (Round 5) |
| Figure: caption-only descriptions | IMPROVED (7–8/10 range) |
| Figure: "I cannot visually display" | ELIMINATED |
| URL letter-spelling for mixed-case paths | FIXED (Round 3) |
| Visual formatting narrated as content | FIXED (Round 3) |
| Custom macro non-expansion | **NEW STRUCTURAL** (code fix in this round) |
| LaTeX template boilerplate bleed-through | **NEW STRUCTURAL** (code fix in this round) |
| Abstract narrated in third person | **NEW** (prompt fix in this round) |
| Raw `\ref{}` / `~ref~` passthrough | MINOR PERSISTENT (code fix in this round) |
