# LLM Script Evaluation Report — 2026-03-23

## Context

This is the **third evaluation round** for the unarXiv LLM narration pipeline. The prior
rounds (2026-03-22 report.md and report_round2.md) identified and applied prompt fixes for:
- Per-chunk intro/outro framing ("Welcome to...", "This concludes...")
- LLM refusal mode for sparse sections
- Custom LaTeX macro passthrough (`\benchname`)
- Duplicate author/affiliation block injection
- Figure descriptions that only restate captions
- Podcast-host openers and editorial adjectives
- Preamble stripping (code-level fix added to `_strip_latex_preamble`)

The cutoff date for `llm_scripting.py` changes is **2026-03-22 22:01:40 UTC-6**.

Three production narration versions exist in the database after this cutoff, all generated
using `openai/gpt-4o`, tier `plus1`:

| Paper | arXiv ID | Created |
|-------|---------|---------|
| Democratic AI | 2411.09222 | 2026-03-23 04:34:50 |
| Molecular Clock Dating | 1603.05707 | 2026-03-23 04:29:37 |
| Generative CI | 2302.00672 | 2026-03-23 04:29:11 |

---

## Executive Summary

| Paper | Goal 1 Fidelity | Goal 2 Citations | Goal 3 Header | Goal 4 Figures | Goal 5 TTS | Total |
|-------|----------------|-----------------|---------------|----------------|-----------|-------|
| 2411.09222 Democratic AI | 7/10 | 10/10 | 9/10 | 5/10 | 9/10 | **40/50** |
| 1603.05707 Molecular Clock | 8/10 | 10/10 | 9/10 | 6/10 | 8/10 | **41/50** |
| 2302.00672 Generative CI | 8/10 | 10/10 | 9/10 | 7/10 | 9/10 | **43/50** |

### Round-over-Round Improvement

| Eval | Avg Score | Key Issues Present |
|------|-----------|--------------------|
| Round 1 (03-22) | 26/50 | Refusals, macros, paraphrasing, section framing, caption-only figures |
| Round 2 (03-22) | 32/50 | Duplicate author blocks, podcast openers, figure refusals, section labels |
| Round 3 (03-23) | **41/50** | Figure descriptions shallow; minor fidelity gaps; one citation artifact in paper 1 |

**Prompt fixes from round 1 and 2 are working.** The three most egregious prior issues —
LLM refusals, "Welcome to..." framing, and duplicate author blocks — are **eliminated** in
all three post-fix scripts.

### Remaining Issues (Round 3)

1. **Figure descriptions: still shallow** — Present in all 3 papers. The LLM describes
   figures from the caption alone but does not name specific data values, visual layout
   details, or relative comparisons. Goal 4 remains the weakest goal.
2. **Minor fidelity gaps** — Paper 1 (Democratic AI, long paper) shows some paragraph
   condensing in dense sections. Papers 2 and 3 are nearly verbatim.
3. **Citation artifact in Paper 1** — One inline citation reference slipped through as
   natural-language attribution ("referenced by Habermas in 1962...") rather than being
   cleanly stripped. Not TTS-breaking but slightly awkward.
4. **URL verbalization** — Paper 1 renders some URLs correctly ("democracylevels.org")
   but the MrBayes URL in Paper 2 is rendered oddly as
   "github dot com slash capital N capital B capital I Sweden slash capital M lowercase r
   capital B a y e s" — letter-by-letter spelling of mixed-case GitHub paths.

---

## Paper 1: Democratic AI (2411.09222)

**Title**: Democratic AI is Possible. The Democracy Levels Framework Shows How It Might Work.
**Authors**: Aviv Ovadya, Kyle Redman, Luke Thorburn, and 11 more
**Published**: 2024-11-14
**LLM**: openai/gpt-4o, tier=plus1
**Script length**: 402 lines | **LaTeX length**: 463 lines

### Score Table

| Goal | Score | Key Finding |
|------|-------|-------------|
| Goal 1: Fidelity | 7/10 | Mostly verbatim; dense appendix sections show mild condensing |
| Goal 2: Citations | 10/10 | No raw `[1]` or `\cite{}` artifacts |
| Goal 3: Header/Footer | 9/10 | No duplicate author block; no per-section framing; clean body start |
| Goal 4: Figures | 5/10 | Captions paraphrased; some visual detail from surrounding text but not enough |
| Goal 5: TTS | 9/10 | Clean LaTeX removal; citation verbalizations ok; one URL verbalized strangely |

### Goal 1 — Fidelity: 7/10

**What's working**: Main body sections (Introduction, Why Democratic AI, Framework Levels)
are closely faithful to source. For example, the Introduction paragraph beginning
"Thankfully, recent innovations in collective decision-making..." is reproduced nearly
verbatim in the script.

**What's still a problem**:

Script lines 273–303 (Appendix: Levels Decision Tool) — the source LaTeX for this section
is a detailed table of questions organized by category (legitimacy, collective intelligence,
feasibility, speed, adaptability, novelty). The script renders this as flowing prose
summarizing categories, but several specific sub-questions are merged or omitted. The source
asks specifically "Is the decision time-critical?" and "Can processes be set up suited to
the time constraint?" — the script collapses both into "Speed is another factor, considering
whether decisions involve time-critical responses." This is mild condensing but detectable.

Script line 307 reads: "The title, 'Democratic System Card', is presented prominently in a
large, dark green font." — This is describing a visual formatting attribute of a table
header in the LaTeX, not content. The LLM should skip this kind of meta-visual description
of document formatting. This is a novel minor issue.

The Generative CI comparison section and Related Work section (lines 228–236) are very
faithful to source.

**Citation verbalization (minor issue)**: Script lines 33–38 cover the "Why democracy?"
section. The LaTeX has dense inline citations like `\citep{Habermas1962,Habermas1989}`.
The script renders these as: "References are made to various scholars who have contributed
to this discussion, including Habermas in 1962, 1989, and 1992, as well as Cohen in 2002
and 2003, Rousseau in 1762..." — This is technically citation-stripping (no raw `[1]`
artifacts), but it converts citation markers into long verbal attributions that dominate
the narration of some paragraphs. A listener hears a list of 12 scholars with years where
the source text is making a cleaner analytical point. Goal 2 is still 10/10 since there
are no literal citation artifacts, but this verbalization pattern is awkward.

### Goal 2 — Citations: 10/10

No raw `[1]`, `\cite{foo}`, or backslash markers in the script. Citation stripping is clean.

### Goal 3 — Header/Footer: 9/10

**Fixed from round 2**: No "Welcome to a narrated presentation of...", no duplicate author
block, no per-section "This concludes..." outros.

Script body begins directly at the abstract narration after the header lines (title, author,
date). The footer is the standard script_builder.py outro.

**Minor remaining issue**: Script line 273 starts with "Appendices." as a section label
narrated as a word. This is a `\appendix` command being rendered as a spoken word, which
is correct (it's contextually meaningful), but it creates a slight awkwardness as if the
narration is announcing a document formatting element.

### Goal 4 — Figures: 5/10

**Figure 1 (system flow diagram)**, script lines 17–19:
> "There is a system diagram, which shows how democratic processes could integrate with the
> AI ecosystem. This diagram visually represents democratic infrastructure being used to
> facilitate, where appropriate, collective decisions relating to AI regulation,
> organizational governance, and alignment."

LaTeX caption: "A system diagram of how democratic processes could integrate with the AI
ecosystem, with democratic infrastructure being used to facilitate—where appropriate—
collective decisions relating to AI regulation, organizational governance, and alignment.
The Democracy Levels Framework we introduce can be used to evaluate (i) the degree to which
democratic systems are used for decision-making, and (ii) the quality of those democratic
systems, and the infrastructure supporting them."

The script paraphrases the caption but adds no visual detail. The paper also mentions
"yellow components" in the figure. The script (line 19) does narrate: "We see this
framework as applicable to each of the yellow components in the diagram: AI systems, AI
organizations, and AI regulators" — picking up the surrounding text reference. This is
better than pure caption restatement.

**Figure 2 (Democracy Levels overview)**, script lines 51–52:
> "The figure is an overview of the Democracy Levels. It describes how much
> decision-making power in a given domain of decision-making has been transferred from a
> unilateral authority to a democratic process. The example column describes hypothetical
> democratic systems operating at each level, with the scope of authority being rules around
> the use of AI systems for persuasion."

This is near-verbatim from the LaTeX caption. No mention of the specific level names
(L0 through L5), what colors or visual cues appear, or which rows show which transitions.
A listener learns the same as reading the caption — nothing more.

**Root cause**: The prompt says to "Name specific data values, percentages, and numbers
visible in the figure" and "Describe the visual layout" — but for figures that are
system diagrams with level labels (not charts), the LLM doesn't know what visual cues
to describe without seeing the figure. It falls back to caption restatement. The prompt
needs a sharper fallback instruction: when a figure is a diagram, flowchart, or table,
describe the *structure* visible from surrounding text (e.g., "a table with 6 rows labeled
L0 through L5, each row describing a level of democratic control").

### Goal 5 — TTS: 9/10

No raw LaTeX artifacts. Model names, percentages, and numbers are spoken correctly.

**URL issue (minor)**: Script line 205 narrates: "you can visit democracylevels.org/system-card"
— correctly spoken. But the ICML affiliation footnote URL (`safeandtrustedai.org`) appears
at line 185 as "safeandtrustedai dot org" — the "dot" is not needed when speaking a .org
domain. Minor inconsistency but not TTS-breaking.

---

## Paper 2: Molecular Clock Dating using MrBayes (1603.05707)

**Title**: Molecular Clock Dating using MrBayes
**Authors**: Chi Zhang
**Published**: 2016-03-17
**LLM**: openai/gpt-4o, tier=plus1
**Script length**: 163 lines | **LaTeX length**: 412 lines

### Score Table

| Goal | Score | Key Finding |
|------|-------|-------------|
| Goal 1: Fidelity | 8/10 | Near-verbatim throughout; command blocks verbalized well |
| Goal 2: Citations | 10/10 | No raw citation artifacts |
| Goal 3: Header/Footer | 9/10 | Clean header; no section framing artifacts |
| Goal 4: Figures | 6/10 | Better than paper 1; specific numbers mentioned; missing visual layout |
| Goal 5: TTS | 8/10 | Command blocks well-spoken; GitHub URL spelled out letter-by-letter |

### Goal 1 — Fidelity: 8/10

This is a technical tutorial paper with specific command blocks and numbered parameters.
The script preserves the technical content remarkably well. For example, the character
exclusion list for morphological partition (LaTeX: `exclude 7 31 61 83 107 121 122 133
182 183 198`) is rendered in script line 39 as:
> "The following characters are excluded: seven, thirty-one, sixty-one, eighty-three, one
> hundred seven, one hundred twenty-one, one hundred twenty-two, one hundred thirty-three,
> one hundred eighty-two, one hundred eighty-three, and one hundred ninety-eight."

Similarly the ordered-change character list (28 character numbers) is verbalized correctly
in lines 41.

**Minor fidelity gap**: Script line 61 adds: "This concludes the section on relaxed clock
models, detailing the models, their implementation, and preparatory steps for subsequent
analyses." — This is a per-section outro that the prompt explicitly prohibits. It's a
single isolated instance (not the pattern of 10–21 instances from round 2), but it is a
regression.

The abstract (lines 7–8) is closely matched to the source. Introduction (lines 9–14) is
verbatim where not citation-affected.

### Goal 2 — Citations: 10/10

Citation handling is clean. The paper has many inline `\citep{}` references which are
stripped without replacing them with verbal attributions in most cases. Some are kept
for major references: "as cited by Huelsenbeck and Ronquist in 2001" (line 9) — this is
acceptable for named foundational references but applied consistently.

### Goal 3 — Header/Footer: 9/10

Script opens with standard header (title, author, date) from script_builder.py. Body
narration begins directly at the abstract. The body-level affiliation metadata from the
LaTeX preamble (`$^1$Department of Bioinformatics...`) is correctly skipped — the
preamble stripping fix is working.

**Single regression**: Line 61 has "This concludes the section on relaxed clock models..."
— one surviving per-section outro. All other sections transition cleanly without this
framing.

### Goal 4 — Figures: 6/10

Better than round 2 (was 3/10 for Democratic AI in round 2). The script does extract
specific content from figure captions and surrounding text.

**Figure 1 (clock rate prior distributions)**, script line 51:
> "This figure is likely showing a graphical representation of normal, lognormal, and
> gamma distributions with the specified mean and standard deviation, allowing for a
> visual comparison of how these probability densities differ."

This is a description inferred from surrounding text (the prior section discusses normal,
lognormal, and gamma distributions with mean 0.001 and SD 0.0007). The LLM correctly
identified that Figure 1 shows these three distributions for comparison. However, it
hedges with "is likely showing" — the prompt says to never hedge, always produce a
concrete description.

**Figure 2 (FBD process)**, script line 82:
> "In the accompanying figure, Figure 2 illustrates the fossilized birth-death process and
> diversified sampling of extant taxa. Exactly one representative taxa per clade descending
> from time x_cut is sampled, marked as blue dots. Fossils are sampled with a constant
> rate between t_mrca and x_cut, marked as red dots."

This is a genuinely good description — specific visual elements (blue dots, red dots,
time markers t_mrca and x_cut) are named. The content comes from the LaTeX text adjacent
to the figure. Score increases for this example.

**Figure 4 (majority-rule consensus trees)**, script line 148:
> "Figure 4 displays majority-rule consensus trees of extant taxa. These trees are derived
> from two methods: a) total-evidence dating, and b) node dating, both conducted under
> diversified sampling and the IGR model. The node heights in these trees are in units of
> million years, and the error bars indicate the 95 percent highest posterior density
> intervals. The numbers at the internal nodes represent the posterior probabilities of the
> corresponding clades."

Good — specific measurement units and annotation types are described. Missing: approximate
age ranges visible in the figure (the script mentions 250 million years for Hymenoptera
root on line 152, which is good), and which clades show disagreement.

### Goal 5 — TTS: 8/10

**GitHub URL issue**: Script line 23 renders the MrBayes GitHub URL as:
> "The program MrBayes can be accessed from the website github dot com slash capital N
> capital B capital I Sweden slash capital M lowercase r capital B a y e s."

This is the prompt's URL normalization guideline being overly aggressive. The URL
`https://github.com/NBISweden/MrBayes` was spoken letter-by-letter because the LLM
detected mixed-case characters (NBISweden, MrBayes) and spelled them out. This is wrong —
the correct narration would be "github.com/NBISweden/MrBayes" or simply
"github dot com slash NBISweden slash MrBayes". The letter-by-letter spelling is
incomprehensible when spoken aloud.

**Root cause**: The prompt says "Render URLs naturally without saying 'dot' or 'slash'" but
does not handle mixed-case paths. The LLM inferred that mixed-case means it should spell
out each letter. A prompt fix is needed: "For GitHub URLs, speak the organization and
repo name naturally as words (e.g., 'github.com/NBISweden/MrBayes' becomes 'github.com,
NBISweden, MrBayes'). Do not spell out letters in URL paths."

**Command blocks**: MrBayes commands like `prset clockratepr equals lognorm -7 0.6` are
verbalized well in most places.

---

## Paper 3: Generative CI (2302.00672)

**Title**: 'Generative CI' through Collective Response Systems
**Authors**: Aviv Ovadya
**Published**: 2023-02-01
**LLM**: openai/gpt-4o, tier=plus1
**Script length**: 128 lines | **LaTeX length**: 280 lines

### Score Table

| Goal | Score | Key Finding |
|------|-------|-------------|
| Goal 1: Fidelity | 8/10 | Near-verbatim; best of three papers |
| Goal 2: Citations | 10/10 | No raw citation artifacts |
| Goal 3: Header/Footer | 9/10 | Clean; no section label artifacts (fixed from round 2) |
| Goal 4: Figures | 7/10 | Paper has few figures; what exists is handled reasonably |
| Goal 5: TTS | 9/10 | Clean; natural prose maps well to TTS |

### Goal 1 — Fidelity: 8/10

This paper received a 7/10 in round 2. The round 3 version improves to 8/10.

**What's fixed from round 2**: No "Section: Motivation" / "End of Section: Motivation"
labels. No per-section "This concludes..." outros.

**Quality example**: Script lines 7–15 (abstract) are closely matched to source. The
LaTeX opens: "This paper frames a specific kind of generative collective intelligence (CI)
facilitation system: the collective response system—and the collective dialogues that it
makes possible." The script renders: "This paper introduces a specific type of generative
collective intelligence facilitation system known as the collective response system, along
with the collective dialogues that these systems enable." The shift from "frames" to
"introduces" is a minor word-level paraphrase, but acceptable — the meaning is preserved.

**Remaining minor issue**: Script line 37 says "These systems enable focused simultaneous
communication at scale and allow collectives to be treated as single agents, which can then
interact with other such collective agents." — This is a faithful rendering of the source.

**Paragraph-level paraphrase (minor)**: LaTeX motivation section has bullet-point items
with bold headers. Script lines 19–26 convert these bullets into prose, which is correct
for TTS, but the bold headers ("Thoughtful deliberation doesn't scale", "People feel
voiceless and disrespected") are dropped. The content of each bullet is preserved, but
the structural emphasis is lost. For a listener, this is acceptable — hearing a list of
bold headers as spoken text would be jarring.

### Goals 2–3: 10/10 and 9/10

No citation artifacts. No section-label passthrough. No "Welcome" framing. Header is
clean.

### Goal 4 — Figures: 7/10

This paper has few figures and they are primarily referenced in inline text. The script
handles the limited figure content appropriately.

### Goal 5 — TTS: 9/10

Best TTS quality of the three papers. The paper is dense prose with minimal LaTeX
constructs. The URL for Polis/Taiwan is handled naturally.

---

## Cross-Paper Patterns (Round 3)

### Pattern 1: Section framing ELIMINATED (FIXED)
No "Welcome to...", "This concludes...", or per-section podcast framing in any of the three
scripts. The prompt fixes from round 2 are working. One isolated regression in Paper 2
(line 61) is the only exception — not the systematic 10–21 instances from prior rounds.

### Pattern 2: Figure descriptions remain shallow (PERSISTENT)
All three papers show the same pattern: figure descriptions rely on caption text and
immediately surrounding paragraphs, but do not produce the structured visual descriptions
(layout type, specific values, relative comparisons) that the prompt requests. Papers 2
and 3 are slightly better because the LaTeX text adjacent to figures contains explicit
visual references (blue/red dots, specific tree labels) — the LLM correctly incorporates
these. But papers with abstract system diagrams (Paper 1) still get caption-only
descriptions.

### Pattern 3: Citation verbalization as attribution (persistent minor)
Rather than completely removing citations, GPT-4o tends to convert dense inline `\citep{}`
chains into "as cited by Author in Year" attributions. This is technically compliant with
the prompt (no raw citation markers), but produces awkward listicle-style narrations in
heavily-cited passages.

### Pattern 4: URL letter-spelling for mixed-case paths (NEW)
The MrBayes GitHub URL demonstrates a new issue: mixed-case URL paths trigger
letter-by-letter spelling. The prompt needs explicit guidance for GitHub/code URLs.

### Pattern 5: Formatting-as-content narration (NEW, minor)
Paper 1 script line 307 narrates: "The title, 'Democratic System Card', is presented
prominently in a large, dark green font." — The LLM is narrating visual formatting
attributes of a LaTeX table. The prompt should instruct the LLM not to narrate visual
styling or formatting attributes of document elements.

---

## Recommended Prompt Changes (Round 3)

### Fix 1: URL handling for mixed-case GitHub/code paths

**Current guideline 4 (clean output) says**:
> "Render URLs naturally without saying 'dot' or 'slash'"

**Problem**: LLM over-applies this to mixed-case URL paths, spelling letters individually.

**Add to guideline 4**:
> "For URLs with mixed-case paths (e.g., GitHub repository URLs), speak the path
> components as words, not letter-by-letter. For example,
> 'https://github.com/NBISweden/MrBayes' becomes 'github.com/NBISweden/MrBayes' —
> say 'NBISweden' as a word, not 'N-B-I-Sweden'. Similarly 'MrBayes' is 'MrBayes' not
> 'M-r-B-a-y-e-s'. Only spell out individual letters when the name is genuinely an
> acronym that would be read as letters (e.g., 'ORCID', 'API')."

### Fix 2: Do not narrate visual document formatting attributes

**Problem**: LLM sometimes narrates visual formatting like "presented in a large dark
green font" which is irrelevant to audio listeners.

**Add to guideline 4 (clean output)**:
> "Do not narrate visual styling or formatting attributes of document elements. Skip
> descriptions of font size, font color, bold/italic style, background color, or similar
> visual design properties. If a table header appears in the LaTeX (e.g., '\\textbf{\\large
> \\color{green} Democratic System Card}'), narrate only the semantic content
> ('Democratic System Card.'), not the formatting."

### Fix 3: Figure descriptions — fallback for diagrams and tables

**Problem**: For system diagrams, flowcharts, and structured tables with levels/rows,
the LLM cannot describe visual layout without seeing the image. It falls back to caption
restatement.

**Strengthen guideline 2 (figures/tables)**:
> "For structured figures such as tables, flowcharts, and multi-level diagrams — where
> you cannot see the visual but can infer structure from context — describe the *structure*
> first. For example: 'Figure 2 is a table with 6 rows, one for each level labeled L0
> through L5. Each row describes...' or 'Figure 1 shows a flowchart with three main
> stages connected by arrows.' Use the LaTeX surrounding text (adjacent paragraphs,
> reference to the figure, the caption's structural descriptions) to infer what type of
> diagram it is. Do not hedge with 'is likely showing' — produce a confident description
> based on available information."

### Fix 4: Citation attribution verboseness (optional, lower priority)

**Problem**: Dense `\citep{Author1,Author2,Author3}` chains become long verbal attribution
lists. Consider stripping to nothing rather than converting to "as cited by X in Year".

**Option A (aggressive)**: Add to guideline 4: "When a sentence has 3 or more inline
citations, remove the attributions entirely rather than listing them all verbally. Keep
attribution only for single, named foundational citations that are important to the content."

**Option B (moderate)**: Add: "For clusters of 4+ inline citations, say 'as referenced
in several works' or 'drawing on prior research' rather than listing all authors and years."

---

## Summary of Issue Status

| Issue | Status in Round 3 |
|-------|-------------------|
| LLM refusal mode | ELIMINATED |
| Per-section framing ("Welcome to...", "This concludes...") | ELIMINATED (1 isolated regression) |
| Duplicate author block injection | ELIMINATED |
| Custom macro passthrough (`\benchname` etc.) | Not tested (no papers with custom macros in round 3) |
| Podcast-host opener | ELIMINATED |
| Editorial adjectives | ELIMINATED |
| Figure: caption-only descriptions | PERSISTENT (improved to 5–7/10 range) |
| Figure: "I cannot visually display" | ELIMINATED |
| URL letter-spelling for mixed-case paths | NEW (Paper 2) |
| Visual formatting narrated as content | NEW (Paper 1, isolated) |
| Dense citation verbalization as attribution | PERSISTENT (minor) |

---

## Implementation Plan

Three prompt fixes to implement in `llm_scripting.py` (`_SYSTEM_PROMPT` and
`_SYSTEM_PROMPT_FALLBACK`):
1. URL guideline: add mixed-case path handling
2. Formatting-as-content: add skip instruction
3. Figure diagrams: add structural inference fallback

These are all prompt-level fixes; no code changes needed.
