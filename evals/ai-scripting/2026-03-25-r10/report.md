# LLM Script Evaluation Report — 2026-03-25 (Round 10)

## Context

**Cutoff commit**: `2dfe8c1` — `eval(round9): fix third-person narration, Cref artifacts, URL dot-slash` — 2026-03-25 13:45:47 -0600 (19:45:47 UTC)

**LLM provider/model**: `openai/gpt-4o` (current default)

**Parser version registered**: `2dfe8c1` / `plus1` — confirmed inserted into `parser_versions` table.

---

## Result: No Scripts to Evaluate

No LLM-upgraded narration scripts have been generated since the cutoff (2026-03-25T19:45:47 UTC). The prompts were just updated in Round 9 and no new papers have been narrated against the updated code yet.

**DB query result**: `narration_versions WHERE llm_provider IS NOT NULL AND created_at > '2026-03-25T19:45:47'` returned 0 rows.

This is expected — Round 9 fixes were deployed approximately 50 minutes before this run. The parser version is registered in the `parser_versions` table so the Quality Insights chart will show this commit as the current period once scripts start accumulating.

---

## Round 9 Fixes — Verification

The following fixes from Round 9 are confirmed present in `llm_scripting.py` (commit `2dfe8c1`):

| Fix | Location | Status |
|-----|----------|--------|
| Third-person banned patterns expanded (explicit list: "The authors state...", "Starting with the X paragraph...", etc.) | `_SYSTEM_PROMPT` guideline 1 (lines 62-73) | Confirmed |
| Positive example added for figure caption first-person reading | `_SYSTEM_PROMPT` guideline 1 (lines 70-72) | Confirmed |
| `\Cref{}`, `\cref{}`, `\autoref{}` added to cross-reference strip list | `_SYSTEM_PROMPT` guideline 4 (line 114) | Confirmed |
| Bare "Cref"/"cref" word stripping post-processing | `_strip_latex_artifacts` (line 517) | Confirmed |
| `\Cref{}`/`\cref{}` regex in post-processing | `_strip_latex_artifacts` (line 513) | Confirmed |
| URL examples with concrete WRONG/RIGHT cases | `_SYSTEM_PROMPT` guideline 4 (lines 132-144) | Confirmed |

---

## Open Issues Carried From Round 9

The following issues were identified in Round 9 but have not yet been validated as fixed (no new scripts to test against):

| Issue | Severity | Round 9 Fix Applied | Needs Validation |
|-------|----------|---------------------|-----------------|
| Third-person meta-narration in appendix/methods sections | High | Yes — expanded banned list + examples | Next narration |
| URL "dot/slash" speaking (inconsistent across chunks) | Medium | Yes — concrete examples added | Next narration |
| `\Cref{}` artifacts ("Appendix Cref") | Low | Yes — prompt + post-processing | Next narration |

---

## Proactive Review: Remaining Prompt Risks

While no new scripts are available to evaluate, a review of the current prompt identifies one area that Round 9 did not address and may warrant attention:

**Guideline 5 mentions "Next, the authors examine..." as a valid spoken transition.** This is a third-person phrase ("the authors examine") — inconsistent with guideline 1's prohibition on third-person narration. If the LLM uses this template transition in the middle of a first-person section, it may sound out of place or contradict the first-person voice.

**Recommended fix**: Change the example transition in guideline 5 from `"Next, the authors examine..."` to `"Moving on to..."` to avoid providing a third-person template.

---

## Prompt Fix Applied This Round

### Fix: Remove third-person template from guideline 5 transitions

**Problem**: Guideline 5 example transition `"Next, the authors examine..."` contradicts the explicit first-person-only rule in guideline 1. The LLM may adopt this phrasing as a template.

**Change**: Updated to `"Moving on to..."` in both `_SYSTEM_PROMPT` and `_SYSTEM_PROMPT_FALLBACK`.

---

## Next Steps

1. Wait for the next paper narration to run against commit `2dfe8c1` (or the new commit with this round's fix).
2. The next run (Round 11) should evaluate those scripts against the 5 quality goals.
3. Primary validation targets: third-person drift and URL handling (the two issues addressed in Round 9 that were historically persistent).
4. If Round 11 still shows third-person drift, escalate to switching from `gpt-4o` to `claude-sonnet-4-6` as recommended in Round 9.
