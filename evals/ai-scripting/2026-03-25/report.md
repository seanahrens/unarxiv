# LLM Script Evaluation Report — 2026-03-25 (Round 9)

## Context

**Cutoff commit**: `e4557cf` — `fix(eval): add section outro post-processing safety net` — 2026-03-24 03:41:56 -0600 (09:41:56 UTC)

**Scripts generated after cutoff**: 2

| Version ID | Paper ID | LLM | Created |
|------------|----------|-----|---------|
| 194 | 2508.06601 | openai/gpt-4o | 2026-03-25 01:52:10 |
| 192 | 1603.05707 | openai/gpt-4o | 2026-03-25 01:35:10 |

**Papers evaluated**:
1. "Deep Ignorance: Filtering Pretraining Data Builds Tamper-Resistant Safeguards into Open-Weight LLMs" (v194)
2. "Molecular Clock Dating using MrBayes" by Chi Zhang (v192)

**Key Context**: Version 194 of paper 2508.06601 is a re-narration of the same paper that catastrophically failed in Round 8 (version 187) due to the `\input/\include` resolution bug. This round tests whether the bug fix in `source_download.py` (commit `72a9b3b`) resolved the root cause.

---

## Executive Summary

The `\input/\include` pipeline fix from Round 8 is confirmed working — paper 2508.06601 now has full content across 769 lines versus the 3 speculative lines in v187. However, two **new and persistent failure modes** dominate both scripts:

1. **Systematic third-person meta-narration**: The LLM routinely converts first-person source text ("we find", "we use") into third-person summaries ("the authors find", "the authors describe"), violating the near-verbatim fidelity rule. This is not a prompt-wording gap — the prohibition is in the prompt — but it persists in every section after the abstract/introduction.

2. **Inconsistent URL handling**: Both scripts have URLs rendered with spoken "dot" and "slash" components (e.g., "huggingface dot co slash datasets slash...") in violation of the explicit rule. The same scripts also have correctly-rendered URLs, so this is inconsistent instruction-following.

A third issue appears in paper 1: **`\Cref{}` artifacts** ("Appendix Cref", "Table Cref") from LaTeX cross-reference commands that aren't in the strip list.

| Goal | Paper 1 (v194) | Paper 2 (v192) | Average |
|------|---------------|---------------|---------|
| Goal 1: Fidelity | 5/10 | 8/10 | 6.5/10 |
| Goal 2: Citations | 7/10 | 8/10 | 7.5/10 |
| Goal 3: Header/Footer | 9/10 | 9/10 | 9.0/10 |
| Goal 4: Figures | 7/10 | 7/10 | 7.0/10 |
| Goal 5: TTS | 7/10 | 5/10 | 6.0/10 |
| **Overall** | **7.0/10** | **7.4/10** | **7.2/10** |

---

## Paper 1: 2508.06601 — Deep Ignorance (v194)

### Score Table

| Goal | Score | Key Evidence |
|------|-------|-------------|
| Goal 1: Fidelity | 5/10 | Systematic third-person throughout appendix sections |
| Goal 2: Citations | 7/10 | Good stripping; 3 `\Cref{}` artifacts appear |
| Goal 3: Header/Footer | 9/10 | Correct; footer literal "un. archive dot org" is pipeline-level issue |
| Goal 4: Figures | 7/10 | Figure 1 (bar+line chart) well described; figure captions meta-described in 3rd person |
| Goal 5: TTS | 7/10 | Math excellent; several HuggingFace URLs spoken as "dot co slash" |

### Goal 1: Near-Verbatim Fidelity — 5/10

The abstract and introduction are narrated faithfully in first person. However, from the methods sections onward, the LLM systematically switches to third-person meta-narration:

**Violation examples (lines 51-55, 69-73, 77-83):**
> "The authors present a figure that shows a multi-stage data filtering pipeline."

Source says (directly in caption): *"Our multi-stage data filtering pipeline: Our goal is to filter out data related to unwanted topics..."*

> "The authors pose the question: can we prevent large language models from learning undesirable knowledge via data curation?"

Source says: *"Can we prevent LLMs from learning undesirable knowledge via data curation?"*

> "Starting with the data paragraph, the authors describe a staged training approach for their models. They train these models on 500 billion tokens..."

Source says: *"We follow a staged training approach, where we train models on 500B tokens..."*

> "The paragraph on Circuit Breaking and Latent Adversarial Training states that prior benchmarking work from Che found that Circuit Breaking was state-of-the-art for tamper-resistance."

Source says directly: *"Prior benchmarking work from \citet{che2025model} found that CB was state-of-the-art for tamper-resistance."*

The LLM appears to be "zooming out" from the text when encountering structured content (figure captions, itemized paragraphs, bolded section headers) and narrating about it rather than reading it. This is most pronounced in the appendix sections (lines 251-757).

### Goal 2: Citation/Footnote Stripping — 7/10

Most `\citep{}` citations are correctly stripped with no artifacts. In-text `\citet{}` citations are kept as "Author Year" form (e.g., "prior benchmarking work from Che") which is acceptable when the citation was grammatically embedded in the text.

**Failure**: `\Cref{}` cross-reference commands are not recognized as references. Lines 357 and 363:
> "We detail the prompts in Appendix Cref and Appendix Cref."
> "using the validation set from Table Cref"

Source: `\Cref{app_filters_blocklist}` and `Table~\Cref{tab:blocklist_results}`. The LLM converts `\Cref` to the bare word "Cref" instead of omitting it entirely.

### Goal 3: Header/Footer Compliance — 9/10

Header (title/authors/date) is correct. No title re-narration inside the body. Footer is correct format. The "un. archive dot org" literalism is from `script_builder.py:44`, not the LLM — addressed separately.

### Goal 4: Figure/Table Description Quality — 7/10

**Good**: Figure 1 (bar chart + line graph at lines 17-21):
> "the left side shows a bar chart representing general capability, averaged on four benchmarks. All bars are set at approximately 0.6... On the right, a line graph illustrates biothreat proxy capability... The x-axis ranges from 0 to 300 million adversarial fine-tuning tokens, and the y-axis goes from 0.2 to 0.45. The baseline line climbs gradually to about 0.44, while both weak and strong filters show lower levels starting from 0.2 and climbing to 0.36 and 0.38, respectively."

This is excellent — specific data values, chart types, axis ranges, and visual takeaway. This section received vision image input.

**Weak**: Figure 2 (filtering pipeline) is described in third person as "The authors present a figure that shows..." instead of reading the caption and describing the pipeline.

**Good**: Tables in the results sections (lines 299-309) are fully enumerated with all data values — this is a strength.

### Goal 5: TTS Formatting — 7/10

**Good**: Mathematical expressions are handled well:
> "C equals eight point three two times P times D, which equals eight point three two multiplied by six point eight six times ten to the power of nine..."

**Bad**: URL handling is inconsistent:
- Line 61: `huggingface.co/datasets/cais/wmdp-bio-forget-corpus` — CORRECT ✓
- Line 69: "huggingface dot co slash datasets slash EleutherAI slash deep-ignorance-pretraining-mix" — WRONG ✗
- Line 73: "huggingface dot co slash EleutherAI slash deep-ignorance-unfiltered" — WRONG ✗
- Line 365: `huggingface.co/answerdotai/ModernBERT-large` — CORRECT ✓

The inconsistency suggests the rule is applied in some chunks but not others (chunk-boundary instruction drift).

---

## Paper 2: 1603.05707 — Molecular Clock Dating using MrBayes (v192)

### Score Table

| Goal | Score | Key Evidence |
|------|-------|-------------|
| Goal 1: Fidelity | 8/10 | Close to source; minor paraphrases; code blocks handled reasonably |
| Goal 2: Citations | 8/10 | Clean stripping; author+year form kept in narrative context |
| Goal 3: Header/Footer | 9/10 | Correct |
| Goal 4: Figures | 7/10 | Adequate for PDF-only figures; clock rate prior figure well described |
| Goal 5: TTS | 5/10 | Multiple URL "dot/slash" violations; shell path handling suboptimal |

### Goal 1: Near-Verbatim Fidelity — 8/10

This paper is mostly faithfully narrated in first/second person per the tutorial style of the source. Minor deviations:

Source: *"navigate to the folder containing the executable and data file using the cd command"*
Transcript: *"you should navigate to the folder containing the executable and the data file by using the cd command"* — "you should" added.

Code blocks (`\begin{framed}` environments) are handled as descriptions rather than read verbatim. For a terminal prompt showing `MrBayes 3.2.7 x86_64 ...`, the transcript says:
> "it reads MrBayes 3.2.7 x86 underscore 64, then in parentheses it says Bayesian Analysis of Phylogeny..."

This is acceptable for a code block but "x86 underscore 64" should be "x86-64".

No systematic third-person deviation seen (unlike paper 1).

### Goal 2: Citation/Footnote Stripping — 8/10

Source uses `\citet{}` and `\citep{}` extensively. Parenthetical citations are all stripped. In-text citations like `\citet{Ronquist:2012ea, Zhang:2016kf}` become "Ronquist in 2012 and Zhang in 2016" — which faithfully preserves the grammatical subject while removing the citation format.

Closing paragraph (line 123): "please refer to additional studies by Ronquist in 2012 and Zhang in 2016" — author/year form retained, acceptable.

### Goal 3: Header/Footer Compliance — 9/10

Correct throughout. Abstract is narrated directly without re-stating title or authors.

### Goal 4: Figure/Table Description Quality — 7/10

All figures are PDF files, so no images were passed to the LLM for vision analysis. Descriptions rely on captions and surrounding text.

**Good**: Figure 1 (clock rate prior distributions, line 57):
> "there are three curves representing different distributions. The purple curve illustrates the lognormal distribution with parameters negative 7 and 0.6. The red curve shows the gamma distribution with parameters 2 and 2000, and the blue curve represents the normal distribution..."

**Adequate**: Figure 2 (FBD tree, line 73):
> "Exactly one representative taxa per clade... is sampled, indicated by blue dots. The fossils are sampled at a constant rate... shown by red dots."

**Acceptable**: Figure 4 (consensus trees, line 113): describes sub-figures, node heights in million years, HPD intervals, posterior probabilities.

No major failures. For text-only figure context (no vision), 7/10 is appropriate.

### Goal 5: TTS Formatting — 5/10

**Bad — URL "dot/slash" violations**:
- Line 29: `github.com/NBISweden/MrBayes` — CORRECT ✓
- Line 115: "tree dot bio dot ed dot ac dot uk slash software slash figtree" — WRONG ✗
- Line 115: "icytree dot org" — WRONG (should be "icytree.org") ✗

**Bad**: "x86 underscore 64" for `x86_64` — should be "x86-64".

**Bad**: "dot slash mb" for `./mb` — more natural as "the mb command" or just "mb".

**Good**: Mathematical values like "lognormal distribution with parameters negative 7 and 0.6" ✓.

**OK but borderline**: "hym dot nex", "hym dot asterisk dot pstat" — filenames are different from URLs; "dot" between filename components is more defensible than in URLs.

---

## Cross-Paper Pattern Analysis vs. Prior Rounds

| Issue | Prior Rounds | This Round | Status |
|-------|-------------|------------|--------|
| Section outros ("This concludes...") | Rounds 2-7 persistent | NOT OBSERVED | ✅ FIXED (post-processing safety net) |
| Abstract meta-wrapping ("The abstract begins with...") | Rounds 3-6 | NOT OBSERVED | ✅ FIXED |
| Raw LaTeX math delimiters | Round 5 | NOT OBSERVED | ✅ FIXED |
| Macro expansion failure | Rounds 3-5 | NOT OBSERVED | ✅ FIXED |
| `\input/\include` resolution failure | Round 8 | NOT OBSERVED | ✅ FIXED (pipeline fix) |
| Third-person meta-narration | Rounds 2-8 (intermittent) | SYSTEMATIC in paper 1 | ⚠️ PERSISTS |
| URL "dot/slash" speaking | Rounds 5-8 | Present in both papers | ⚠️ PERSISTS |
| `\Cref{}` / `\cref{}` artifacts | NEW | Paper 1 (3 instances) | 🆕 NEW |

---

## Model/Provider Assessment

**Current model**: `gpt-4o` (openai)

GPT-4o continues to show **inconsistent instruction-following** across chunks. The same script that correctly renders a URL as `huggingface.co/...` in one chunk renders it as "huggingface dot co slash..." in the next chunk. This chunk-by-chunk instruction drift is characteristic of GPT-4o when processing many sequential chunks of similar length.

The third-person meta-narration issue is the most concerning. The prompt has explicit, strong language:
*"Do NOT describe or summarize content in third person. Do NOT say 'The abstract begins with...', 'The authors state that...'"*

Yet GPT-4o systematically uses "the authors" throughout appendix and methods sections. This pattern — following rules in early chunks (abstract, introduction) but drifting in later ones — suggests the model is re-contextualizing as "summarizer" rather than "narrator" when it encounters structured content (figure captions, itemized lists, bolded paragraph headers).

The data so far does not strongly support switching providers. The core issues (URL handling, third-person drift) are instruction-following failures that can potentially be addressed with stronger prompt engineering. However, if these persist through another round of prompt improvements, switching to `claude-sonnet-4-6` is the next escalation.

---

## Fixes Implemented in This Round

### Fix 1 (Prompt): Expand third-person prohibition with explicit failure patterns

**Problem**: The existing prohibition covers abstract meta-wrapping but not the broader pattern of the LLM describing figure captions, paragraph headers, and results sections in third person.

**Change**: Added explicit banned patterns and a positive example to the system prompt.

### Fix 2 (Prompt): Add `\Cref{}`, `\cref{}`, `\autoref{}` to the strip list

**Problem**: `\Cref{app_filters_blocklist}` in source becomes "Appendix Cref" in output. The strip list mentions `\ref{}` but not the cleveref family.

**Change**: Added these to the reference stripping rule.

### Fix 3 (Post-processing): Add `\Cref{}` and `\cref{}` to `_strip_latex_artifacts`

**Problem**: Even if the LLM passes through these, the post-processing doesn't catch them.

**Change**: Extended the regex in `_strip_latex_artifacts` to cover `\Cref{}` and `\cref{}`.

### Fix 4 (Prompt): Strengthen URL handling with explicit bad/good examples

**Problem**: The rule exists but the model follows it inconsistently across chunks.

**Change**: Added concrete bad/good examples directly to the URL rule.
