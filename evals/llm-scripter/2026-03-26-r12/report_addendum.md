# r12 Addendum: Remaining Papers (Sonnet 4.6 + Haiku 4.5 post-fix)

**Date:** 2026-03-26 (continued evaluation)
**Scope:** 6 additional narration versions created after the r12 cutoff
  (commit c3beefc, 2026-03-26 05:57:10 UTC) that were missed in the initial pass.
**Models evaluated:** claude-sonnet-4-6 (3 papers) and claude-haiku-4-5-20251001 (3 papers)

---

## Versions Evaluated

| Version ID | arXiv ID    | Model                      | Notes                       |
|-----------|-------------|----------------------------|-----------------------------|
| 260       | 2512.03399  | claude-sonnet-4-6          | Full-Stack Alignment        |
| 261       | 2301.09976  | claude-sonnet-4-6          | Bridging Systems            |
| 263       | 2603.16859  | claude-sonnet-4-6          | SocialOmni (pipeline fail)  |
| 307       | 2411.09222  | claude-haiku-4-5-20251001  | Democratic AI framework     |
| 309       | 2404.10636  | claude-haiku-4-5-20251001  | Moral Graph Elicitation     |
| 313       | 2105.05142  | claude-haiku-4-5-20251001  | Pirates/Liquid Democracy    |

---

## Scores

Scoring rubric: 1–10 per goal, averaged → converted to 0.0–1.0.

| Goal                    | 260  | 261  | 263* | 307  | 309  | 313  |
|------------------------|------|------|------|------|------|------|
| 1. Fidelity            | 8.5  | 8.5  | 1.0  | 8.5  | 8.0  | 7.5  |
| 2. Citation stripping  | 8.5  | 8.5  | 9.0  | 8.5  | 7.0  | 8.5  |
| 3. Header/footer       | 9.0  | 9.0  | 9.0  | 6.5  | 8.5  | 8.5  |
| 4. Figure descriptions | 8.0  | 8.0  | 7.0  | 8.0  | 9.0  | 3.0  |
| 5. TTS formatting      | 8.5  | 8.5  | 9.0  | 8.0  | 8.5  | 7.5  |
| **Average**            | **8.5** | **8.5** | **7.0** | **7.9** | **8.2** | **7.0** |
| **Score (0–1)**        | **0.85** | **0.85** | **0.70** | **0.79** | **0.82** | **0.70** |
| Pass (≥0.82)?          | ✅   | ✅   | ❌*  | ❌   | ✅   | ❌   |

*263 fails due to pipeline issue, not LLM quality.

---

## Paper-by-Paper Findings

### 260 — 2512.03399 (Full-Stack Alignment, Sonnet 4.6) — **0.85 PASS**

Clean narration of a philosophy-heavy alignment paper. All 266 lines flow naturally.
"Reference" words preserved correctly (e.g., "reference frame", "referenced in").
No section header artifacts, no LLM refusals, math handling appropriate.
Minor citation artifacts (inline `\citet{}` references produce "while does separate..."
type gaps) but these are within normal tolerance. Strong fidelity throughout.

### 261 — 2301.09976 (Bridging Systems, Sonnet 4.6) — **0.85 PASS**

393-line narration of a social recommender systems paper. Clean and complete.
"Reference model" preserved without dropout. Good coverage of technical content.
No structural artifacts. Consistent with r12 initial pass quality.

### 263 — 2603.16859 (SocialOmni, Sonnet 4.6) — **0.70 FAIL (pipeline failure)**

**Root cause: `\def\input@path` not handled by regex scripter.**

The paper's LaTeX uses `\def\input@path{{content/}}` to route all `\input{}` calls
to a `content/` subdirectory. The regex scripter's `_split_latex_into_sections()`
does not resolve this path redirect, so only 18 lines were generated — the title,
affiliations, author list, contact info, and sign-off. Zero paper body content was
narrated.

The 18 lines that were generated are technically well-formed:
- Institutions described cleanly
- One good logo/seal description (4 university/project logos identified with visual detail)
- Correct sign-off

LLM quality on the input it received: good. The failure is in the regex scripter
pipeline, not the LLM.

**Recommendation:** Fix `_extract_body()` or `_split_latex_into_sections()` in
`regex_scripter/` to detect and resolve `\def\input@path{{subdir/}}` before splitting.

### 307 — 2411.09222 (Democratic AI framework, Haiku 4.5) — **0.79 FAIL**

**Issue: Standalone section header artifacts (multiple occurrences)**

Lines "Abstract.", "Dimensions.", "Related Frameworks.", "Example Application.",
"Alternative Views." all appear as bare standalone headings in the transcript.
The system prompt explicitly prohibits this ("do NOT output section headings as
a standalone line or label"), but Haiku 4.5 does not follow this instruction
reliably.

No "reference" word dropout detected — the fix from r12 is working.
Content quality is high: 159 lines covering a complex governance framework paper
with good coverage of levels, dimensions, and the democracy levels tools.
Table description at lines 87–93 is detailed and informative.

**Root cause:** Haiku 4.5 follows heading-suppression instructions less reliably
than Sonnet 4.6. Added explicit "NO BARE SECTION LABELS" paragraph to both
system prompts (fix committed with this addendum).

### 309 — 2404.10636 (Moral Graph Elicitation, Haiku 4.5) — **0.82 PASS**

Strong narration of a complex values-and-alignment paper. 376 lines.
Figure descriptions are excellent — three figures described in rich detail:
the MGE three-step process diagram (line 13), the preferences/rules/values
comparison table (line 78), and the values card anatomy (line 179).
"Reference" words preserved (line 163: "referencing that alignment target,
much as court decisions reference case law and legal norms").

Minor citation stripping artifact: some `\citet{}` references stripped to empty,
leaving "while does separate..." and "Inspired by the work of," gaps. These don't
break comprehension but are slightly jarring. Score: 7.0 for citation stripping.

### 313 — 2105.05142 (Pirates/Liquid Democracy, Haiku 4.5) — **0.70 FAIL**

**Two issues found:**

**Issue 1 (critical): LLM refusal at line 53**
Despite the system prompt's explicit instruction ("NEVER write phrases like
'Unfortunately I cannot'... never say 'I cannot display the figure'"), Haiku 4.5
produced:
> "I cannot provide a detailed description of this figure because no image data
> is available to analyze. The LaTeX source references a file called 'ExampleLD'
> but the actual image content is not accessible to me. To create an accurate
> spoken description suitable for audio narration, I would need to see the actual
> visualization..."

This is 4+ sentences of chatbot-style refusal text that will be read aloud to users.
Root cause: the figure (ExampleLD) has no caption and no surrounding data values —
only "An example of a delegation graph is shown." Haiku could not infer what to write
and fell back to a refusal.

Fix applied: Added explicit instruction covering the "no surrounding data" case:
"If the surrounding text contains no specific visual details about a figure, write
ONE brief contextualizing sentence using what is known from surrounding prose."

**Issue 2: Duplicate DISPLAY_MATH blocks**
DISPLAY_MATH_010 through DISPLAY_MATH_018 appear identically at both lines 87–115
and lines 127–143. This is a 29-line duplication artifact in the output.
Likely cause: the LLM chunk boundary fell mid-math-block and the context included
the same equations twice. Not a prompt failure — a chunking artifact.

Outside these two issues: the math verbalization is excellent. Equations are
spelled out clearly (e.g., "u sub i of lambda times y sub i plus one minus lambda
times z sub i"). Good fidelity to the theoretical content.

---

## Cross-Model Comparison: "Reference" Word Dropout Fix

The r12 fix (added clarifying paragraph distinguishing `\ref{label}` deletion from
English-word "reference" preservation) is confirmed working across all 6 papers:
- Sonnet 4.6: "reference" preserved in all 3 papers ✅
- Haiku 4.5: "reference" preserved in all 3 papers ✅

No new instances of the dropout bug detected.

---

## New Issues Identified and Fixed

### Fix 1: Haiku "no bare section labels" (applied to both system prompts)

**Before:** "ALSO: Do NOT output section headings as standalone announcement
sentences like 'The section is titled...' Instead, absorb..."

**After:** Added explicit block: "CRITICAL — NO BARE SECTION LABELS: NEVER write
single words like 'Abstract.', 'Introduction.', 'Conclusion.' as a bare line.
These are structural labels, not narration. They must be absorbed into transitions."

### Fix 2: Haiku figure refusal fallback (applied to both system prompts)

**Before:** "When no image is provided for a figure, describe it from the available
text... never say 'I cannot display the figure'..."

**After:** Added explicit case for zero-context figures: "If the surrounding text
contains no specific visual details about a figure, write ONE brief contextualizing
sentence using what is known from surrounding prose, e.g., 'The paper includes a
figure here illustrating the delegation graph structure described above.' Do NOT
write 'I cannot provide a description', 'no image data is available', 'the image
content is not accessible to me', or any similar refusal."

---

## Outstanding Issues (Not Fixed This Round)

1. **`\def\input@path` pipeline failure (2603.16859):** The regex scripter doesn't
   resolve `\def\input@path{{subdir/}}` path redirects. Entire paper body missed.
   Fix requires changes to `regex_scripter/` — deferred.

2. **DISPLAY_MATH duplication (2105.05142):** Equations repeated due to chunk
   boundary overlap. Requires investigation into how math-heavy sections are split.
   Deferred.

3. **Citation gap artifacts (`\citet{}` stripping):** Papers with author-citation
   commands like `\citet{gabriel2020artificial}` produce "while does separate..."
   gaps. Current prompt doesn't address this case explicitly. Deferred.

---

## Score Summary (This Addendum)

| Version | Model   | Score | Pass? |
|---------|---------|-------|-------|
| 260     | Sonnet  | 0.85  | ✅    |
| 261     | Sonnet  | 0.85  | ✅    |
| 263     | Sonnet  | 0.70  | ❌ (pipeline) |
| 307     | Haiku   | 0.79  | ❌    |
| 309     | Haiku   | 0.82  | ✅    |
| 313     | Haiku   | 0.70  | ❌    |

**Sonnet 4.6 post-fix:** 2/3 pass (263 excluded for pipeline failure → 2/2 on LLM quality)
**Haiku 4.5 post-fix:** 1/3 pass

Haiku 4.5 shows lower instruction-following fidelity than Sonnet 4.6, particularly
on structural formatting rules (heading suppression) and refusal avoidance for edge
cases. This may warrant routing complex papers back to Sonnet for production, or
accepting Haiku quality as the default and monitoring.
