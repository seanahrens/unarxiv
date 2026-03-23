# LLM Script Evaluation Report — 2026-03-22

## Scope

Only **1 paper** with an upgraded narration script exists in the production database at the time of this evaluation (out of 121 total narrated papers). This report evaluates that single paper thoroughly. The prompts are updated based on findings from this one paper.

---

## Executive Summary

| Goal | Description | Score |
|------|-------------|-------|
| Goal 1 | Near-Verbatim Fidelity | 3/10 |
| Goal 2 | Citation/Footnote Stripping | 9/10 |
| Goal 3 | Header/Footer Compliance | 7/10 |
| Goal 4 | Figure/Table/Chart Description Quality | 3/10 |
| Goal 5 | TTS Formatting Quality | 4/10 |
| **Overall** | | **26/50** |

### Top-Level Findings

1. **Critical: LLM breaks character mid-script** — Two instances where GPT-4o gives up and writes meta-commentary instead of narrating content.
2. **Critical: Raw LaTeX macros not stripped** — `\benchname` appears 9 times in the script; a TTS system would read it as "backslash benchname".
3. **Severe: Content is paraphrased, not verbatim** — The paper's introduction (4 dense paragraphs) is condensed into ~2 paragraphs of paraphrase. This is the core failure of the current prompt.
4. **Poor figure descriptions** — Figures described by restating captions, not by describing actual visual elements, data points, or relative comparisons.
5. **Citation stripping is the one bright spot** — No `[1]` or `\cite{}` artifacts visible.

---

## Paper 1: VTC-Bench

**arXiv ID**: 2603.15030
**Title**: VTC-Bench: Evaluating Agentic Multimodal Models via Compositional Visual Tool Chaining
**Published**: 2026-03-16
**LLM Provider**: openai / gpt-4o
**Upgraded script length**: 376 lines
**LaTeX source length**: 1,760 lines

### Score Table

| Goal | Score | Summary |
|------|-------|---------|
| Goal 1: Verbatim Fidelity | 3/10 | Major paraphrasing; two outright refusals to narrate |
| Goal 2: Citation Stripping | 9/10 | No `[1]` or `\cite{}` artifacts; minor issue only |
| Goal 3: Header/Footer | 7/10 | No duplicate title/authors in body; "And that concludes..." per-section outros are intrusive |
| Goal 4: Figure Descriptions | 3/10 | Captions restated; no data points, visual layout, or relative comparisons |
| Goal 5: TTS Formatting | 4/10 | 9 raw `\benchname` macros; equations handled okay where they appear |

---

### Detailed Findings

#### Goal 1: Near-Verbatim Fidelity — Score 3/10

**Problem 1: Abstract massively condensed.**

The LaTeX abstract (lines 182–184) is a 9-sentence dense paragraph covering all contributions. The script (lines 1–13) represents this as:
> "Welcome to the section on the Visual Tool Chain Benchmark, known as `\benchname`... Current benchmarks are limited... To address this gap..."

This is a ~3x compression and a paraphrase, not a narration. Key claims from the abstract — that the model evaluations revealed *models struggling to generalize to unseen operations*, *reliance on suboptimal familiar functions*, and *Gemini-3.0-Pro only achieving 51%* — are all present but scattered rather than verbatim.

**Problem 2: Introduction compressed from 4 paragraphs to ~2.**

LaTeX introduction (lines 201–210) has 4 substantial paragraphs covering: (a) MLLMs tool use evolution, (b) limitations of current benchmarks, (c) the benchmark's contributions, and (d) analysis findings. The script (lines 15–24) condenses this. For example, the LaTeX has:
> "This ensures models are assessed on their underlying logical reasoning rather than merely their final predictions."

The script omits this entirely and paraphrases surrounding text.

**Problem 3: LLM refuses to narrate (critical failure).**

Script line 213:
> "We are now exploring the section titled 'Skills versus Interface.' Unfortunately, as the text provided does not contain any content within this section, I'm unable to narrate specific details or findings. If you have additional text for this section, please provide it so we can delve into the complete narration."

The LLM has broken character and is now responding as if it's a chatbot being asked to help, rather than processing the LaTeX source it was given. This is a complete failure for the listener.

Script line 301:
> "Sorry, I can only assist with creating narration scripts if you provide the specific content you'd like converted from the research paper. Please include the text of the section, and I'll be happy to help!"

This is the LLM receiving a LaTeX chunk that was likely a section header with minimal content, and instead of narrating what's there, it refuses. This breaks the audio experience entirely.

**Problem 4: Generic boilerplate replaces real content.**

Script lines 255–265 cover the "Detailed Tool Set And Data Collection" appendix section. But instead of narrating the actual 35-tool taxonomy from the LaTeX, the script says:
> "The authors begin by discussing the selection of tools that were specifically chosen for their capacity to effectively gather and analyze data. They highlight the importance of using a diverse array of instruments..."

This is entirely fabricated generic academic language. The actual LaTeX at this point contains a specific table with 35 OpenCV tools organized into Geometry, Enhancement, Feature Extraction, and Drawing categories — none of which appears in the script at this location.

**Root cause**: The prompt says "Do NOT summarize" and "Cover every point the authors make" but the LLM interprets "comprehensive coverage" as permission to paraphrase. The prompt needs to explicitly say that the output must preserve the original sentence structure and wording wherever possible — only changing TTS-unfriendly formatting, not content or phrasing.

---

#### Goal 2: Citation/Footnote Stripping — Score 9/10

No `[1]`, `[2-5]` or `\cite{foo}` artifacts visible in the script. This goal is largely met.

**Minor issue**: The script renders model names with awkward phrasing like "Gemini version three point oh professional" (script line 91) — this is a version number being spoken oddly, but it's acceptable.

**Not a citation issue** but related: The script sometimes replaces specific citations with vague attributions like "studies by researchers like MM-REACT and the Socratic Models" (line 25) — technically citation-free, but loses precision.

---

#### Goal 3: Header/Footer Compliance — Score 7/10

The script body does not begin with title/authors/date (these are added by `script_builder.py`'s `build_script()` before storing). The LLM does not duplicate those elements.

**Issues**:
1. Each chunk ends with a mini-conclusion like "And that concludes this detailed overview of the Visual Tool Chain Benchmark" (line 13) and "This concludes the description of this section's experiment setup" (line 155). These chunk-level sign-offs are artifacts of per-section processing and feel awkward when the audio continues into the next section seamlessly.

2. Each chunk starts with "Welcome to..." framing (lines 1, 15, 45, 61, 87, 131, 241, etc.) which makes the narration feel like a podcast intro to each section rather than a flowing reading of the paper.

**Root cause**: The prompt doesn't tell the LLM that each chunk is part of a larger concatenated script. The LLM wraps each section like a self-contained mini-episode.

---

#### Goal 4: Figure/Table/Chart Description Quality — Score 3/10

**Figure 1 (Teaser figure)** — Script line 11:
> "Now let's turn our attention to Figure 1, which provides a comprehensive overview of the \benchname framework and the reasoning workflow of agentic models. The top panel of the figure displays the architecture of the framework, highlighting a hierarchical task taxonomy and a toolkit driven by MLLMs. Meanwhile, the bottom panel of the figure illustrates the multi-stage reasoning trajectory..."

This is almost verbatim from the LaTeX caption. There are no actual descriptions of what appears in the figure visually (e.g., what icons, arrows, flow directions, highlighted paths appear). A listener learns essentially nothing beyond the caption.

**Benchmark comparison table** (script lines 33–35):
> "A table in the research presents a comparison of the proposed benchmark with existing multimodal benchmarks. It highlights that the new framework encompasses 32 diverse tools and supports dual interaction paradigms... Notable benchmarks such as V*, HRBench, and GTA are mentioned..."

The table has 7 rows comparing benchmarks across 8 columns (Paradigm, #QA, #Tasks, #Tools, RT, MTC, LHC, SFD). The script doesn't describe which benchmarks support which features, which have the most tools, or what the visual check/cross pattern means.

**Statistical overview figure** (script lines 69–74):
> "In the table on the left, we see a statistical summary of the benchmark. It shows that there are a total of 680 questions available. Of these, 538 are multiple-choice... On the right, a figure illustrates domain distribution and toolchain lengths... Darker shades are used to indicate longer steps."

Slightly better — specific numbers are included. But the chart on the right (which shows domain distribution) has no specific percentages or category names mentioned. Which domains are largest? What fraction have chain length 5+? None of this is conveyed.

**Root cause**: The prompt says "Describe what they show verbally. Use phrases like 'Figure 3 shows...' followed by key findings and trends." This only guides the LLM to restate captions. It needs to explicitly demand specific data points, visual layout description, relative comparisons between items, and exact numbers from chart elements.

---

#### Goal 5: TTS Formatting Quality — Score 4/10

**Critical: `\benchname` macro not resolved** (9 occurrences):

Lines 1, 3, 7, 11, 13, 53, 91, 95, 97 all contain `\benchname` which would be spoken by TTS as "backslash benchname". The prompt says "Remove all LaTeX formatting commands" but this macro isn't caught because it looks like a regular word reference and the LLM doesn't know its expansion ("VTC-Bench").

**Math equations**: Handled well where they appear. Script line 103:
> "MAE equals one over N, multiplied by the sum of the absolute differences between L_G,i and L_T,i"

The use of "L_G,i" and "L_T,i" (subscripts spoken as separate letters) is borderline — a TTS system might read "L underscore G comma i" — but it's acceptable.

**Version numbers**: "Gemini version three point oh professional" (lines 91, 137) is awkward but intelligible.

**Percentages**: Properly spoken as "fifty-one percent" etc. throughout.

**Root cause**: The prompt mentions removing LaTeX commands but doesn't specifically mention custom macros defined with `\newcommand`. The LLM should be instructed that if it encounters unknown `\commandname` patterns, it should attempt to replace them with the expansion found elsewhere in the document, or skip/spell-out the macro name.

---

### Per-Section Issue Summary

| Script Lines | Section | Issues |
|---|---|---|
| 1–13 | Abstract | Condensed; `\benchname`×3; intro/outro framing |
| 15–24 | Introduction | Condensed; loses specific wording |
| 25–43 | Related Work | Paraphrase acceptable; table description weak |
| 45–59 | VTC-Bench intro | `\benchname`×2; per-section outro |
| 61–85 | Benchmark Design | Generally good; minor TTS issues |
| 87–101 | Benchmark Construction | `\benchname`×2; good accuracy |
| 97–115 | Evaluation Metrics | Good; math equations handled well |
| 117–129 | Experiments overview | Repetitive (~3x same content restated) |
| 131–155 | Experiment Setup | Generally accurate |
| 157–191 | Main Results | Generally good and detailed |
| 193–211 | Analysis | Good |
| 213 | (empty section) | **LLM refuses to narrate** |
| 215–221 | Prompt Ablation | Reasonable |
| 223–237 | Conclusion | Slightly vague |
| 241–253 | Implementation Details | Good; accurate hyperparameters |
| 255–265 | Tool Set (appendix) | **Generic boilerplate** replacing real content |
| 267–277 | Tool taxonomy | Good — specific tool names listed |
| 301 | (empty section) | **LLM refusal** |
| 313–345 | System prompts appendix | Reasonable |
| 347–367 | Task examples appendix | Very brief, minimal |
| 369–377 | Model reasoning appendix | Minimal — just mentions figure captions |

---

## Cross-Paper Patterns

*(Only one paper with an upgraded script exists. Patterns noted from this single evaluation.)*

1. **Per-chunk framing artifacts**: Every LaTeX section is wrapped in "Welcome to..." intro and "...this concludes" outro. These are artifacts of chunk-level processing without awareness that chunks will be concatenated.

2. **Custom macro passthrough**: `\benchname` (and likely other custom macros like `\citep`, `\Fig`, etc. in other papers) are not resolved and leak into the output.

3. **LLM refusal mode**: When a chunk contains only a section heading or minimal content, the LLM responds with chatbot-style refusal rather than either narrating the minimal content or producing empty output.

4. **Content paraphrase vs. verbatim**: The prompt's instruction to "cover every point" is interpreted as permission to rewrite in the LLM's own words rather than preserving the authors' original phrasing.

5. **Figure captions restated, not described**: The LLM reads figure captions and rephrases them as descriptions, but does not attempt to describe the actual visual elements, data relationships, or what a listener would perceive.

---

## Recommended Prompt Changes

### Problem 1: Verbatim fidelity (Goal 1)

**Current prompt** (line 49-50):
> "6. Do NOT summarize: Your narration must be comprehensive, not a summary."

**Problem**: "comprehensive" still gives the LLM permission to paraphrase. The word "verbatim" is missing.

**Recommended change**: Replace guideline 6 with:

> "6. Near-verbatim fidelity: Preserve the authors' exact wording wherever possible. Do NOT paraphrase, rewrite, or condense any sentence. The ONLY permitted changes are: (a) removing LaTeX markup/commands, (b) expanding inline math to spoken English, and (c) describing figures/tables. Every sentence in the source must produce a corresponding spoken sentence in the output."

### Problem 2: LLM refusal mode (Goal 1)

**Add as new guideline**:

> "8. Never refuse or add meta-commentary: If a chunk contains only a section heading or sparse content, narrate whatever is present. Do NOT write phrases like 'Unfortunately I cannot', 'Please provide more content', or 'Sorry, I can only...'. You are a narration engine, not a chatbot. Process whatever input you receive and produce the best possible narration."

### Problem 3: Custom LaTeX macros (Goal 5)

**Modify guideline 4**:

> "4. Clean output: Remove all LaTeX formatting commands, including custom macros (e.g., \\benchname, \\myterm). If you encounter an unknown `\\macroname` command, look for its `\\newcommand{\\macroname}{expansion}` definition earlier in the document and replace it with the expansion. If no definition is found, replace it with the macro name without the backslash (e.g., `\\VTCBench` → 'VTC-Bench'). Also remove: citation markers like [1], [2,3], \\cite{}, \\citep{}, \\citealt{}; footnote references; raw URLs; \\label{} commands; \\ref{} commands (replace with the referred name if mentioned nearby, otherwise omit)."

### Problem 4: Per-chunk intro/outro artifacts (Goal 3)

**Add as new guideline**:

> "9. No section introductions or conclusions: Do NOT write 'Welcome to...' or 'This concludes...' or 'Let's begin with...' type framing. Your output will be concatenated with outputs from other sections into a single continuous narration. Simply begin narrating the content directly. Use spoken transitions like 'Moving on to...' or 'Next, the authors examine...' only to bridge within-section topic shifts, not as section wrappers."

### Problem 5: Figure/table description quality (Goal 4)

**Replace guideline 2** with:

> "2. Figures and tables: Describe them with enough detail that a listener who cannot see them still understands ~75% of the meaning. Requirements:
>    - Name specific data values, percentages, and numbers visible in the figure
>    - Describe the visual layout (e.g., 'a horizontal bar chart', 'a 3-column table', 'a scatter plot')
>    - Highlight relative comparisons (e.g., 'X outperforms Y by 8 points', 'the top cluster contains three models within 5% of each other')
>    - Convey the main takeaway visually (not just from the caption)
>    - Example: Instead of 'Figure 3 shows model performance', say: 'Figure 3 is a bar chart showing performance of 7 models. GPT-4o leads at 74%, followed closely by Gemini-Pro at 71%, while the remaining five models cluster between 45-55%. Open-source models (shown in blue) consistently trail proprietary models (shown in orange).'
>    - Use captions, labels, and surrounding text to infer data points not explicitly listed."

---

## Updated Prompt (both `_SYSTEM_PROMPT` and `_SYSTEM_PROMPT_FALLBACK` in `llm_scripting.py`)

See changes applied directly to `llm_scripting.py`.
