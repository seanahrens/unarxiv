# LLM Script Evaluation Report — Round 2 (2026-03-22)

Evaluating three production narration scripts generated before the Round 1 prompt changes.
All three use `script_type='base'` with `llm_provider='openai'` (gpt-4o), tier `plus1` or `plus2`.

---

## Executive Summary

| Paper | Goal 1 Fidelity | Goal 2 Citations | Goal 3 Header | Goal 4 Figures | Goal 5 TTS | Total |
|-------|----------------|-----------------|---------------|----------------|-----------|-------|
| 2411.09222 Democratic AI | 5/10 | 9/10 | 4/10 | 3/10 | 7/10 | 28/50 |
| 2302.00672 Generative CI | 7/10 | 9/10 | 8/10 | 7/10 | 8/10 | 39/50 |
| 2411.10534 Chain of Alignment | 5/10 | 9/10 | 5/10 | 3/10 | 7/10 | 29/50 |

### New Issues Found (not identified in Round 1)

1. **Duplicate author/affiliation injection** — LLM processes the LaTeX preamble `\author{}` block and narrates ALL author affiliations as body content, after the script_builder.py header already lists them concisely.
2. **"I cannot visually display" figure cop-out** — LLM says it can't show the figure and then generates generic placeholder text about what such diagrams "typically" contain, rather than describing the specific figure from its caption and nearby text.
3. **Podcast-host opener** — Scripts open with "Today, we will discuss a fascinating method..." or "Welcome to a narrated presentation of the research paper titled..." — editorial host framing.
4. **Section label passthrough** — LaTeX `\section{Motivation}` rendered as "Section: Motivation" label in script, with matching "End of Section: Motivation" close added by LLM.
5. **Fabricated figure content** — When the LLM can't describe a figure from surrounding context, it invents generic academic text rather than saying "the figure shows..." and using what's available in the caption.
6. **Editorial adjectives** — "fascinating method", "insightful research paper" — LLM adds its own qualitative judgments.

---

## Paper 2: Democratic AI (2411.09222)

**Title**: Democratic AI is Possible. The Democracy Levels Framework Shows How It Might Work.
**Authors**: Aviv Ovadya, Kyle Redman, Luke Thorburn, and 11 more
**Published**: 2024-11-14
**LLM**: openai/gpt-4o, tier=plus1

### Score Table

| Goal | Score | Key Issue |
|------|-------|-----------|
| Goal 1: Fidelity | 5/10 | Heavy per-section framing; content is paraphrased not verbatim |
| Goal 2: Citations | 9/10 | No raw citations |
| Goal 3: Header/Footer | 4/10 | Duplicate author block; per-section "Thank you for listening" outros |
| Goal 4: Figures | 3/10 | Captions restated; no data/visual layout described |
| Goal 5: TTS | 7/10 | Clean, no raw LaTeX; some URL oddities |

### Critical Finding: Duplicate Author/Affiliation Block

The script header (lines 1–5) is correct, from script_builder.py:
```
Democratic AI is Possible. The Democracy Levels Framework Shows How It Might Work.
By Aviv Ovadya, Kyle Redman, Luke Thorburn, and 11 more authors.
Published on November 14, 2024.
```

But lines 7–9 add a second author block narrated by the LLM:
> "Welcome to a narrated presentation of the research paper titled 'Democratic AI is Possible...' This paper has been authored by a diverse group of experts from various institutions. Let's begin by listing the contributors: Aviv Ovadya from the AI & Democracy Foundation, Kyle Redman from both the AI & Democracy Foundation and newDemocracy Foundation, Luke Thorburn from AI & Democracy Foundation and King's College London, Quan Ze Chen from the AI & Democracy Foundation and University of Washington..."

This goes on for two full paragraphs listing every author with their institution and email, then repeats the affiliation section. **The LLM processed the LaTeX preamble (the `\icmlauthor{}`, `\icmlaffiliation{}` commands) and treated it as narration content.** A listener hears the title and abbreviated author list, then immediately hears it all again in full with every institutional affiliation. This is the single worst audio quality issue found.

**Root cause**: The LaTeX source begins with the document preamble, and the first "chunk" fed to the LLM contains all this author metadata. The LLM correctly identifies it as paper content and narrates it — but it shouldn't, because script_builder.py already handles this.

**Fix needed**: The prompt must explicitly instruct the LLM to skip LaTeX preamble elements. Better: the chunking code in `llm_scripting.py` should strip the preamble before chunking.

### Per-Section Framing (21 instances)

"This concludes..." appears 10 times, "Welcome to..." appears 4 times. Every section is wrapped like a podcast episode. Examples:
- Line 21: "This concludes our narrated presentation of the abstract section from this insightful research paper. Thank you for listening."
- Line 33: "This concludes the introduction section, where we've explored the governance challenges..."
- Line 91: "That concludes our discussion of terminology in this section."
- Line 103: "In summary, this section comprehensively covers..."
- Line 437: "This concludes our detailed walkthrough. Thank you for listening."

### Figure Descriptions

Line 29 (Figure 3 system diagram):
> "Let us consider Figure 3, a system diagram showcasing how democratic processes could integrate with the AI ecosystem."

The actual caption reads: "A system diagram of how democratic processes could integrate with the AI ecosystem, with democratic infrastructure being used to facilitate—where appropriate—collective decisions relating to AI regulation, organizational governance, and alignment." The script adds nothing beyond restating this. There's no mention of the yellow components, the directional flow, which elements are connected to which, or what the "yellow components" in the figure represent.

Line 67 (Figure 3 Democracy Levels overview):
> "Now, directing our attention to Figure 3. It provides an overview of the Democracy Levels, with each level named in bold text. This figure is used to assess how much decision-making power in a specific domain has been shifted from a unilateral authority to a democratic process."

The caption explicitly describes "the example column [describing] hypothetical democratic systems operating at each level, with the scope of authority being rules around the use of AI systems for persuasion." None of this example content is conveyed in the script.

---

## Paper 3: Generative CI (2302.00672)

**Title**: 'Generative CI' through Collective Response Systems
**Authors**: Aviv Ovadya
**Published**: 2023-02-01
**LLM**: openai/gpt-4o, tier=plus2

### Score Table

| Goal | Score | Key Issue |
|------|-------|-----------|
| Goal 1: Fidelity | 7/10 | Best of the four; content largely preserved |
| Goal 2: Citations | 9/10 | No raw citations |
| Goal 3: Header/Footer | 8/10 | No duplicate author injection; only minor section-label issues |
| Goal 4: Figures | 7/10 | Short paper with few figures; limited test |
| Goal 5: TTS | 8/10 | Cleanest TTS quality of all four papers |

### Why This Script Works Better

This is a short, text-heavy paper (280-line LaTeX, 166-line script, single author). Several factors likely contribute to better quality:
- Short paper = fewer chunks = less accumulated framing artifacts
- No complex author metadata in preamble
- Few figures to fail on
- Straightforward prose-heavy content maps well to narration

### Remaining Issues

**Section label passthrough** — Line 17: "Section: Motivation." and Line 41: "End of Section: Motivation." These are section boundary markers the LLM added, not actual paper content. The original LaTeX just has `\section{Motivation}`.

**Minor section outros** — Lines 107, 127, 147, 165 have "To conclude..." or "This concludes..." endings, though far fewer than in the other papers.

**Short-section problem** — Lines 43–49 cover the "Contributions" section. The LaTeX source for this section is a single paragraph followed by "Let's dive into the section on Structure and Process. A collective response system..." (line 45) — the LLM immediately transitions into the next section's content. This isn't wrong, but the framing shows the LLM inventing structure.

### Best Example of Good Fidelity

The abstract narration (lines 7–16) is closely faithful to the original. Comparing:

LaTeX abstract: "This paper introduces a particular kind of facilitation system for generative collective intelligence, known as the 'collective response system,' and explores the 'collective dialogues' that it enables. The paper defines the structure, processes, key properties, and key principles of these systems with the aim of establishing a useful shared language."

Script (line 7): "This paper introduces a particular kind of facilitation system for generative collective intelligence, known as the 'collective response system,' and explores the 'collective dialogues' that it enables. The paper defines the structure, processes, key properties, and key principles of these systems with the aim of establishing a useful shared language."

This is nearly verbatim — demonstrating that the model CAN preserve fidelity when the content is simple prose and the preamble doesn't interfere.

---

## Paper 4: Chain of Alignment (2411.10534)

**Title**: Chain of Alignment: Integrating Public Will with Expert Intelligence for Language Model Alignment
**Authors**: Andrew Konya, Aviv Ovadya, Kevin Feng, and 4 more
**Published**: 2024-11-15
**LLM**: openai/gpt-4o, tier=plus1

### Score Table

| Goal | Score | Key Issue |
|------|-------|-----------|
| Goal 1: Fidelity | 5/10 | Podcast-host opener; appendix refusal; figure hallucination |
| Goal 2: Citations | 9/10 | No raw citations |
| Goal 3: Header/Footer | 5/10 | Podcast opener repeats title; appendix refusal mid-script |
| Goal 4: Figures | 3/10 | "I cannot visually display" mode; fabricated descriptions |
| Goal 5: TTS | 7/10 | Good equation verbalization; some awkward subscript handling |

### Critical Finding: "I Cannot Visually Display" Mode

Script line 105:
> "Starting with the section titled 'Appendix.' It appears that the content for this section has not been provided in the LaTeX document you shared. Therefore, there is no specific information to narrate. If there were content in the appendix, it would typically include additional details, data, or methods that support the main text of the research paper. Please provide the actual content of the appendix, and I'll be glad to help narrate it in detail."

This is a chatbot refusal where the LLM received a LaTeX chunk that contained only an `\appendix` command or a near-empty section header.

Script lines 117–126:
> "In this section, we delve into the details of the process used for creating normative objectives. There is a figure included, titled 'Diagram of process for creating normative objectives.' While I cannot visually display the figure, I'll describe its purpose and content.
> This diagram illustrates the series of steps and considerations involved in the creation of normative objectives within the context of the research. It visually represents the structured method that guides how these objectives are identified, formulated, and refined."

The LLM then continues with two more paragraphs of completely generic text: "typically such diagrams would include a sequence of actions or stages, possibly starting from an initial idea or hypothesis." This is **fabricated generic text** masquerading as a figure description. The caption in the LaTeX is simply "Diagram of process for creating normative objectives" — minimal. But the LLM should still say something specific (e.g., describe the steps the text discusses in adjacent paragraphs) rather than invent generic academic placeholder text.

**Root cause**: The LLM treats figures as visual objects it needs to "see." The prompt needs to clarify that the LLM should describe figures from their captions, surrounding text, and LaTeX source — not from visual perception.

### Podcast-Host Opener

Script line 7:
> "Today, we will discuss a fascinating method described in a recent research paper titled 'Chain of Alignment: Integrating Public Will with Expert Intelligence for Language Model Alignment', authored by Andrew Konya, Aviv Ovadya, Kevin Feng..."

This opener:
1. Uses "Today, we will discuss" — podcast host framing
2. Uses "fascinating" — editorial adjective the author didn't write
3. Restates the paper title — which already appears at line 1 from script_builder.py
4. Partially re-lists authors — already in the header at line 3

### Good: Equation Verbalization

The script handles math well. Script line 11:
> "a Pearson's correlation coefficient of zero point eight four one and an Area Under Curve, or AUC, of zero point nine six four"

Script line 73:
> "they calculate a value, denoted as phi sub rj. This value is obtained by subtracting the fraction of experts assessing that a rule decreases the chance of achieving an objective from the fraction who believe it increases the chance"

The subscript verbalization ("phi sub rj", "phi sub r comma capital J") is the best approach available in plain text, though slightly awkward to hear.

---

## Cross-Paper Patterns (All 4 Papers)

### Pattern 1: Per-section framing artifacts (ALL 4)
Every paper shows the LLM wrapping each LaTeX chunk with a welcome/conclusion frame. The count varies:
- 2603.15030 VTC-Bench: ~10 section frames
- 2411.09222 Democratic AI: ~21 section frames
- 2302.00672 Generative CI: ~3 section frames (fewest)
- 2411.10534 Chain of Alignment: ~5 section frames

The longer the paper and the more LaTeX sections, the more framing artifacts accumulate.

### Pattern 2: Figure descriptions = caption restatement (ALL 4)
Across all papers, the figure description approach is: state the figure number, restate the caption, move on. No specific data values, no visual layout, no comparisons. The gold-standard example in the task spec was never approached.

### Pattern 3: LLM refusal for sparse chunks (3/4 papers)
When a LaTeX chunk contains only a heading or a short section, the LLM either:
a) Refuses to narrate ("I cannot help without content")
b) Fabricates generic text ("typically such sections include...")
c) Generates a one-sentence transition then moves on

### Pattern 4: Citation stripping is reliable (ALL 4)
No `[1]` or `\cite{}` artifacts in any of the four scripts. This goal is consistently met.

### Pattern 5: Good fidelity on simple prose, poor on metadata/preamble (3/4)
The Generative CI paper (single-author, short, few figures) had the highest fidelity score. The three multi-author papers with rich LaTeX preambles all had metadata injection or host-mode openers.

### Pattern 6: Custom LaTeX macros only matter when defined (1/4)
Only VTC-Bench (2603.15030) had `\benchname` leaking through. The other three papers used fewer custom macros or had simpler LaTeX. The macro passthrough issue is real but paper-dependent.

---

## New Prompt Changes Recommended

### New Fix 1: Preamble stripping (solves duplicate author injection)

**Problem**: The first LaTeX chunk often contains the document preamble (`\author{}`, `\affiliation{}`, `\maketitle`, etc.) which the LLM narrates as body content, duplicating the script_builder.py header.

**Two-part solution**:

**Part A** (code fix in `llm_scripting.py`): Strip the LaTeX preamble before chunking. Add a function that removes everything from the start of the document to `\begin{abstract}` or the first `\section{}`, then processes from there.

**Part B** (prompt addition): Add to guideline 1:
> "Do NOT narrate LaTeX document metadata: `\\title{}`, `\\author{}`, `\\affiliation{}`, `\\institute{}`, `\\maketitle`, `\\begin{document}`, email addresses in author blocks, ORCID links, or similar preamble content. The title, authors, and date are handled by a separate system. Start narrating at the abstract or first body section."

### New Fix 2: Figure description without visual access (solves "I cannot visually display")

**Add to guideline 2**:
> "You do not need to visually see a figure to describe it. Use the figure's `\\caption{}` text, axis labels mentioned in the LaTeX, data values referenced in adjacent paragraphs, and any specific numbers or findings the authors attribute to the figure. Never say 'I cannot visually display the figure' or 'While I cannot see this figure'. Always produce a concrete description using available text context. If the caption is the only available information, describe what a listener would expect to see based on the caption and surrounding discussion."

### New Fix 3: Podcast-host opener ban (solves editorial framing)

**Strengthen guideline 5** (already partially in the updated prompt):
> "Never open with 'Today we will discuss...', 'Welcome to a narrated presentation of...', 'In this paper, we...' as if you are a podcast host. Do not use editorial adjectives like 'fascinating', 'insightful', 'interesting', or 'important' unless they appear in the original source text. Your voice is the paper's voice, not a commentator's voice."

### New Fix 4: Section label handling

**Add to guideline 4 (clean output)**:
> "Do not narrate LaTeX section headings as labels. When you encounter `\\section{Introduction}`, do not output 'Section: Introduction.' or 'Introduction.' as a standalone line — simply begin narrating the section's content. Likewise, never add 'End of Section: X' or 'That concludes Section X.' markers."

### New Fix 5: URL rendering

**Add to guideline 4 (clean output)**:
> "Render URLs naturally: remove `https://`, and say the domain naturally as it would be spoken. For example, `\\href{https://democracylevels.org/system-card}{democracylevels.org/system-card}` becomes 'democracylevels.org/system-card'. Do not say 'dot' or 'slash' between URL components unless it's genuinely needed for clarity (e.g., a long path)."

---

## Code-Level Fix: Preamble Stripping

Beyond the prompt, a code fix in `_split_latex_into_sections()` would prevent the preamble injection reliably. The function should strip everything before the first section/abstract when splitting.

See prompt changes applied to `llm_scripting.py`.
