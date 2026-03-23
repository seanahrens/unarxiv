# LLM Script Evaluation Report — 2026-03-23 (Round 5)

## Context

This is **Round 5** for the unarXiv LLM narration pipeline evaluation. Round 4 (report_round4_check.md) was
a no-op — no new scripts had been generated since the Round 3 prompt fixes. This run evaluates scripts
generated after the current commit.

**Cutoff commit**: `3d97b188` — most recent change to `llm_scripting.py` (2026-03-23 09:23:57 -0600)
**Cutoff timestamp**: 2026-03-23 15:23:57 UTC

Three production narration versions exist in the database after this cutoff, all generated using
`openai/gpt-4o`, tier `plus1`:

| Paper | arXiv ID | Created |
|-------|---------|---------|
| SegviGen: Repurposing 3D Generative Model for Part Segmentation | 2603.16869 | 2026-03-23 18:48:58 |
| Molecular Clock Dating using MrBayes | 1603.05707 | 2026-03-23 18:46:33 |
| 'Generative CI' through Collective Response Systems | 2302.00672 | 2026-03-23 18:44:49 |

Papers 2 and 3 were also evaluated in Round 3 for direct comparison.

---

## Executive Summary

| Paper | Goal 1 Fidelity | Goal 2 Citations | Goal 3 Header | Goal 4 Figures | Goal 5 TTS | Total |
|-------|----------------|-----------------|---------------|----------------|-----------|-------|
| 2603.16869 SegviGen (NEW) | 6/10 | 10/10 | 7/10 | 7/10 | 3/10 | **33/50** |
| 1603.05707 MrBayes | 7/10 | 10/10 | 7/10 | 7/10 | 9/10 | **40/50** |
| 2302.00672 Generative CI | 8/10 | 10/10 | 8/10 | 7/10 | 9/10 | **42/50** |

### Round-over-Round Progress

| Eval | Avg Score | Key Issues |
|------|-----------|------------|
| Round 1 (03-22) | 26/50 | Refusals, macros, paraphrasing, section framing, caption-only figures |
| Round 2 (03-22) | 32/50 | Duplicate author blocks, podcast openers, figure refusals |
| Round 3 (03-23) | 41/50 | Shallow figure descriptions, URL letter-spelling, formatting narration |
| Round 5 (03-23) | **38/50** | **Raw LaTeX math in output (new, critical), persistent sparse-section meta-commentary** |

**Round 5 average is lower than Round 3** due to two new failure modes in Paper 1 (SegviGen), a
math-heavy paper that had not been tested before. Papers 2 and 3 are stable or improved.

### Critical New Issues (Round 5)

1. **CRITICAL: Raw LaTeX math output** — Paper 1 (SegviGen), lines 71–147 of the script, contains
   raw LaTeX math notation: `\( X \)`, `\[ \hat{v}_\theta = ... \]`, `\begin{equation}`, etc.
   A TTS engine would read these as literal backslash sequences. This is a complete TTS failure
   for the methodology section.

2. **PERSISTENT: Chatbot meta-commentary on sparse sections** — Papers 1 and 2 both show the LLM
   entering "helpbot" mode when encountering section headers with no following body content:
   - Paper 1, script line 167: "There is no accompanying content following the section heading.
     Therefore, this concludes the section."
   - Paper 1, script line 187: "The section titled 'Ablation Studies and Analysis' appears to
     contain only a section heading, without any additional content provided. Thus, the heading
     'Ablation Studies and Analysis' itself is what is present in this portion of the document."
   - Paper 2, script lines 23–25: "Start with the section title: Tutorial. Now, proceed with the
     content that would be present under this section label. Since there is no content provided
     here, you simply announce the title without adding any summarization or addition."

   These phrases, despite being explicitly prohibited by guideline 6, keep returning. This is the
   third round in which chatbot meta-commentary has appeared (rounds 2, 3, and now 5).

### Improvements Since Round 3

- **URL handling**: MrBayes GitHub URL now correctly rendered as "github.com/NBISweden/MrBayes"
  (not letter-by-letter). Round 3 fix confirmed working.
- **Figure formatting**: Paper 1's table descriptions (lines 163, 181, 195–197) are genuinely good —
  specific numbers, percentages, comparison data named explicitly.
- **No formatting-as-content narration**: Paper 1 has no "presented in large green font" type
  narration. Round 3 fix confirmed working.
- **Figure structural inference**: Paper 1 correctly describes Table 1 and Table "auto segmentation"
  with specific rows and values rather than just restating captions.

---

## Paper 1: SegviGen (2603.16869) — NEW PAPER

**Title**: SegviGen: Repurposing 3D Generative Model for Part Segmentation
**Authors**: Lin Li, Haoran Feng, Zehuan Huang, and 8 more authors
**Published**: March 17, 2026
**LLM**: openai/gpt-4o, tier=plus1
**Script length**: 213 lines | **LaTeX length**: 730 lines (multi-file)

### Score Table

| Goal | Score | Key Finding |
|------|-------|-------------|
| Goal 1: Fidelity | 6/10 | Mostly preserved; some condensing; section heading narration artifacts |
| Goal 2: Citations | 10/10 | No raw citation artifacts |
| Goal 3: Header/Footer | 7/10 | No duplicate author block; but section headings narrated as standalone lines |
| Goal 4: Figures | 7/10 | Table descriptions excellent; figure descriptions good with specific visual notes |
| Goal 5: TTS | 3/10 | **CRITICAL**: 77 lines of raw LaTeX math delimiters in output |

### Goal 1 — Fidelity: 6/10

**What's working**: Abstract (lines 7–9) is near-verbatim with correct 2D→"two-dimensional" and
3D→"three-dimensional" substitutions. Introduction (lines 11–17) preserves all key claims and the
core research question ("How can 3D generative priors be effectively transferred...") verbatim.

**What's broken**:

The paper's Related Work section is rendered well. However, the Methodology section (lines 47–147)
has degraded fidelity because the equations are output in LaTeX format rather than spoken English.
For example, source LaTeX:
```latex
A pretrained DiT-based backbone is fine-tuned to predict the noise residual conditioned on \ldots
\begin{equation}
\hat{v}_\theta \;=\; f_\theta\!\left(y_t,\, z,\, C,\, e_{\tau},\, t\right).
\end{equation}
```
Becomes in the script (lines 75–79):
> "A pretrained DiT-based backbone is fine-tuned to predict the noise residual conditioned on the
> noisy input \( y_t \), the geometry latent \( z \), the task condition \( C \), and a learned
> task embedding \( e_{\tau} \)...
> \[ \hat{v}_{\theta} = f_{\theta}(y_t, z, C, e_{\tau}, t). \]"

The prose text is correctly preserved but all inline and block math is output as raw LaTeX.

Script line 25: "The section is titled 'Related Work.'" — section heading output as standalone prose.
Script line 149: "Experiments." — `\section{Experiments}` rendered as a one-word sentence.

**Meta-commentary on sparse chunks** (fidelity issue):
Lines 167 and 187 show the LLM producing multi-sentence explanations about the absence of content
where it should simply produce a short transition.

### Goal 2 — Citations: 10/10

No `[1]`, `\cite{}`, or backslash markers in the script. All inline citations stripped cleanly.

### Goal 3 — Header/Footer: 7/10

Standard header (title, authors, date) and footer are correct. No duplicate author block.

**Issues**:
- Script line 25: "The section is titled 'Related Work.'" — section heading narrated as a standalone
  announcement rather than removed or absorbed into a natural transition.
- Script line 149: "Experiments." — `\section{Experiments}` header output as a one-word line.
- Script lines 167, 187: Meta-commentary about empty chunk content.

These three types of section-handling artifacts reduce the header/footer score.

### Goal 4 — Figures: 7/10

**Table 1 (interactive segmentation)**, script lines 163–164:
> "Table One provides a comparison of interactive part segmentation performance measured with IoU
> at different numbers of clicks. It contrasts SegviGen with Point-SAM and P3-SAM on the datasets
> PartObjaverse-Tiny and PartNeXT. In the case of PartObjaverse-Tiny, SegviGen performs most
> impressively, showing an IoU of 42.49 at one click, increasing to 75.02 at ten clicks."

Excellent — specific numbers, dataset names, comparison models all named. This is the gold standard.

**Figure "comparison_point"**, script lines 89:
> "Figure with the label 'comparison point' compares SegviGen with existing baselines such as
> Point-SAM and P3-SAM. In this figure, yellow points are user clicks, and the predicted target
> part is marked in red. SegviGen, by leveraging priors from pretrained 3D generative models,
> achieves more accurate results with sharper boundaries than prior methods, while requiring
> substantially less training data."

Good — specific visual elements (yellow points, red marking) described. The description goes beyond
the caption.

**Figure 1 (pipeline)**, script line 39:
> "Figure 1 illustrates the pipeline of a method called SegviGen. This approach reformulates 3D
> part segmentation as a conditional colorization task. During training, given a 3D mesh and its
> part-color ground truth, both are encoded using a pretrained 3D Variational Autoencoder, or VAE."

Decent structural description. The description covers the pipeline stages.

### Goal 5 — TTS: 3/10

**CRITICAL FAILURE**: Lines 71–147 contain raw LaTeX math notation:

- Inline: `\( X \)`, `\( z = E(X) \)`, `\( y_t = (1-t)\,y + t\,\epsilon \)`, `\(\mathcal{N}(0, I)\)`
- Block: `\[ \hat{v}_\theta = f_\theta(y_t, z, C, e_{\tau}, t) \]`
- Multiple full `\begin{equation}...\end{equation}` blocks rendered as LaTeX

A TTS engine would read these literally: "backslash-open-paren X backslash-close-paren",
"backslash-left-bracket backslash-hat-v..." etc. The entire methodology section (roughly 30% of
the paper) is unlistenable.

**Root cause**: The Methodology section has `\begin{equation}` blocks with multiple lines of math.
The LLM seems to have chosen to preserve the LaTeX form rather than convert to spoken English —
possibly because the equations are complex and the model defaulted to the LaTeX representation as
a "safe" output format.

The prompt's guideline 3 says "Speak mathematical expressions in plain English... without any
symbols or LaTeX notation" — but this is clearly insufficient for equation environments. The
prompt needs an explicit prohibition on outputting LaTeX delimiters.

---

## Paper 2: Molecular Clock Dating using MrBayes (1603.05707)

**Title**: Molecular Clock Dating using MrBayes
**Authors**: Chi Zhang
**Published**: 2016-03-17
**LLM**: openai/gpt-4o, tier=plus1
**Script length**: 172 lines | **Round 3 script**: 163 lines

### Score Table

| Goal | Score | Round 3 Score | Change |
|------|-------|--------------|--------|
| Goal 1: Fidelity | 7/10 | 8/10 | -1 |
| Goal 2: Citations | 10/10 | 10/10 | 0 |
| Goal 3: Header/Footer | 7/10 | 9/10 | -2 |
| Goal 4: Figures | 7/10 | 6/10 | +1 |
| Goal 5: TTS | 9/10 | 8/10 | +1 |

### Goal 1 — Fidelity: 7/10

Content is mostly preserved. Technical parameters, command blocks, and numbered lists are
verbalized well (e.g., the charset definitions on lines 43–55 are accurate).

**Regression**: Script lines 23–25 show the LLM meta-narrating how it handles a sparse chunk:
> "Start with the section title: Tutorial. Now, proceed with the content that would be present
> under this section label. Since there is no content provided here, you simply announce the title
> without adding any summarization or addition."

This is the LLM narrating its own internal instructions — a complete chatbot-mode regression.

### Goal 2 — Citations: 10/10

Clean citation stripping across the paper.

### Goal 3 — Header/Footer: 7/10

**Fixed from Round 3**: GitHub URL for MrBayes is now "github.com/NBISweden/MrBayes" (correctly).

**Regression**: Lines 23–25 contain the meta-commentary block described above. This is content
that should never appear in a final script. It corrupts the narration of the Tutorial section.

### Goal 4 — Figures: 7/10

**Figure 1 (clock rate priors)**, script line 77:
> "It is a plot showing the normal, lognormal, and gamma distributions, which are color-coded as
> purple for the lognormal, red for the gamma, and blue for the normal distribution. Notably, each
> curve peaks around the mean of zero point zero zero one and varies according to the distribution type."

Improved from Round 3: specific color coding now mentioned (Round 3 was 6/10, this is better).

**Figure 2 (FBD process)**, script line 105:
> "Blue dots indicate the extant taxa, and red dots represent the fossils, sampled at a constant
> rate between t_mrca and x_cut."

Good specific visual description. Retained from Round 3.

### Goal 5 — TTS: 9/10

The GitHub URL fix is working. No "dot" or "slash" in URL rendering. Math verbalization is
correct throughout (e.g., "lognorm, with parameters negative seven and zero point six").

**Minor remaining issue**: Script line 101 renders `` `nodeagepr` `` as a backtick-quoted command
name rather than speaking it naturally. Minor TTS artifact.

---

## Paper 3: 'Generative CI' through Collective Response Systems (2302.00672)

**Title**: 'Generative CI' through Collective Response Systems
**Authors**: Aviv Ovadya
**Published**: 2023-02-01
**LLM**: openai/gpt-4o, tier=plus1
**Script length**: 143 lines | **Round 3 script**: 128 lines

### Score Table

| Goal | Score | Round 3 Score | Change |
|------|-------|--------------|--------|
| Goal 1: Fidelity | 8/10 | 8/10 | 0 |
| Goal 2: Citations | 10/10 | 10/10 | 0 |
| Goal 3: Header/Footer | 8/10 | 9/10 | -1 |
| Goal 4: Figures | 7/10 | 7/10 | 0 |
| Goal 5: TTS | 9/10 | 9/10 | 0 |

### Goal 1 — Fidelity: 8/10

Content is well-preserved. No significant condensing. Abstract (lines 7–9) and main body content
are near-verbatim.

### Goals 2–5

Minor regression: script line 97 has "This brings us to the end of the section on collective
dialogue." — a per-section outro, isolated but persistent. Same class of issue seen in prior rounds.

Otherwise stable compared to Round 3.

---

## Cross-Paper Patterns (Round 5)

### Pattern 1: Raw LaTeX math output — NEW, CRITICAL
Only in Paper 1 (math-heavy paper). Lines 71–147 of the SegviGen script contain raw `\( \)`,
`\[ \]`, and equation-block LaTeX that a TTS engine cannot render.

**Analysis**: The Methodology section of SegviGen has dense equation blocks. The LLM (gpt-4o)
chose to output the equations in LaTeX rather than converting to spoken English — likely because
the conversions are non-trivial and the model's "helpful" instinct was to preserve the LaTeX form.

**This is directly caused by an insufficient prompt guideline.** Guideline 3 says "Speak mathematical
expressions in plain English... without any symbols or LaTeX notation" but does not explicitly say
"NEVER output LaTeX delimiters." The LLM interpreted this as "the final expression should be
English" but still outputted the surrounding LaTeX delimiters.

### Pattern 2: Chatbot meta-commentary on sparse sections — PERSISTENT (Rounds 2, 3, 5)
Papers 1 and 2 both show the LLM generating meta-commentary when encountering a section header
with no following body content. This has appeared in every evaluation round despite being addressed
in guideline 6.

**Analysis**: The current guideline 6 says "If a chunk contains only a section heading or sparse
content, narrate whatever is present." But this instruction is not concrete enough. The LLM
interprets "narrate whatever is present" as license to explain what is present — which is nothing.
A concrete example of the expected output (a single transition sentence) is needed.

### Pattern 3: Section heading narrated as standalone line — MINOR
Papers 1 and 2 show section headings being narrated as standalone lines like "The section is titled
'Related Work.'" or "Experiments." The prompt says to not output section headings as standalone
labels, but the instruction is not explicit enough about what to do instead.

### Pattern 4: Figure/table descriptions — IMPROVED
Paper 1 demonstrates the best table descriptions seen across all rounds. Specific numbers, dataset
names, and relative comparisons are clearly stated. The round 3 figure structural inference fix is
working for tabular data. This is the one area showing clear improvement.

---

## Provider / Model Assessment

**Current model**: openai/gpt-4o (user-selected via API key at narration time).

### Failure analysis

Three persistent failure modes have been observed across multiple rounds, all of which are
instruction-following failures:

1. **Raw LaTeX math output** (new): Outputs LaTeX delimiters despite instruction to use spoken English.
2. **Meta-commentary on sparse sections** (rounds 2, 3, 5): Says "no content here" despite explicit
   prohibition in guideline 6.
3. **Per-section outros** (rounds 2, 3, 5): Isolated "This concludes the section on..." phrases
   despite prohibition in guideline 5.

GPT-4o is a strong model but has a consistent pattern of **reverting to chatbot-mode defaults** on
edge cases (sparse content, complex math) even when the prompt explicitly prohibits those behaviors.
This suggests the prompt instructions are being overridden by the model's fine-tuning defaults.

**Assessment**: The primary driver of these failures is GPT-4o's strong "helpful assistant" fine-tuning
which causes it to explain what it's doing (meta-commentary) or preserve technical content as-is
(LaTeX passthrough) when uncertain. Claude Sonnet 4.6 typically has stronger structured-output
compliance and is less likely to fall into chatbot-mode on edge cases.

**Recommendation**: Since the llm_provider is user-selected, we cannot force a switch. However:
1. Update `DEFAULT_MODELS.llm.anthropic` in `premium.ts` from `claude-3-5-haiku-20241022` to
   `claude-sonnet-4-6` to improve the default for Anthropic users.
2. The prompt fixes below should reduce GPT-4o failures significantly — but the persistent
   meta-commentary pattern suggests diminishing returns from prompt tuning alone.

---

## Recommended Fixes

### Fix 1 (CRITICAL): Explicit prohibition on LaTeX math delimiters

**Problem**: LLM outputs `\( \)`, `\[ \]`, `\begin{equation}` in the script.

**Add to guideline 3**:
> "CRITICAL: NEVER output LaTeX math delimiters in your output. This means: NEVER write `\(`,
> `\)`, `\[`, `\]`, `\begin{equation}`, `\end{equation}`, `\begin{align}`, `\end{align}`,
> `\begin{gather}`, or any other LaTeX math environment markers. Convert ALL mathematical
> notation to spoken English BEFORE writing the output. If you write a sentence containing
> a variable or formula, write the spoken version: NOT `the variable \( z \)` but `the variable z`."

Also add a **code-level post-processing** safety net: after the LLM returns a chunk, strip any
remaining LaTeX math delimiters (`\(`, `\)`, `\[`, `\]`) from the output and log a warning.

### Fix 2: Concrete handling of sparse/heading-only chunks

**Problem**: LLM generates meta-commentary when a chunk has only a section heading.

**Replace current guideline 6 text** with a more concrete version:
> "6. Never refuse or add meta-commentary: You are a narration engine, not a chatbot. If a chunk
>    contains only a section heading with no body content (e.g., just `\section{Tutorial}`), output
>    EXACTLY ONE transition sentence such as: 'Moving on to the tutorial section.' or
>    'Next, the methodology.' Do NOT write 'there is no content here', 'this section contains only
>    a heading', 'I will now narrate...', 'Start with the section title:', 'proceed with the content
>    that would be present', or anything else meta. Just output the transition sentence and stop.
>    If a chunk has some content but is sparse, narrate whatever is there without comment."

### Fix 3: Section heading handling clarification

**Problem**: LLM sometimes outputs "The section is titled 'X'" as a standalone narration line.

**Add to guideline 4 (clean output)**:
> "Do NOT output section heading commands as standalone announcement sentences like 'The section
> is titled X' or 'This is the X section.' Instead, absorb the section heading into a natural
> spoken transition: `\section{Related Work}` → 'Moving on to related work...' or simply begin
> narrating the content of that section."

### Fix 4: Update DEFAULT_MODELS.llm.anthropic in premium.ts

Change `claude-3-5-haiku-20241022` → `claude-sonnet-4-6` to match the current `llm_scripting.py`
default and use the more capable current model.

---

## Summary of Issue Status (Round 5)

| Issue | Status |
|-------|--------|
| LLM refusal mode | ELIMINATED |
| Per-section framing ("Welcome to...", "This concludes...") | MOSTLY ELIMINATED (isolated regressions) |
| Duplicate author block injection | ELIMINATED |
| Podcast-host opener | ELIMINATED |
| Editorial adjectives | ELIMINATED |
| Raw LaTeX math output | **NEW CRITICAL** (Math-heavy papers only) |
| Chatbot meta-commentary on sparse sections | **PERSISTENT** (all rounds) |
| Section heading narrated as standalone line | **PERSISTENT (MINOR)** |
| Figure: caption-only descriptions | IMPROVED (5–7/10 range, now 7/10) |
| Figure: "I cannot visually display" | ELIMINATED |
| URL letter-spelling for mixed-case paths | FIXED (Round 3) |
| Visual formatting narrated as content | FIXED (Round 3) |
| Dense citation verbalization as attribution | MINOR (persistent) |
