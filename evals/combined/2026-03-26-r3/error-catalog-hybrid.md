# Error Catalog — Hybrid Tier

**Evaluation run:** 2026-03-26-r3
**Commit evaluated:** `569cb05` (pre-628cec3, pre-fix)
**Active commit:** `628cec3` (fix landed; these scores are pre-fix)
**Papers evaluated:** 2211.12434 (pre-fix), 2302.00672 (pre-fix)

**Important note:** The 628cec3 commit added a 200-character body-length guard to `hybrid_scripter/__init__.py`. The empty-body failure below should no longer occur with the current code. However, no post-fix hybrid scripts exist yet to verify this, so the issue is logged here with its pre-fix behavior documented.

---

## Error: Empty body — hybrid pipeline produces near-empty output (FIXED in 628cec3)

**Goal:** Near-Verbatim Fidelity (Goal 1)
**Severity:** high
**Frequency:** 1/2 papers (2211.12434); may have been higher in pre-fix builds
**Paper(s):** 2211.12434

### What the scripter produced
```
Expansive Participatory AI: Supporting Dreaming within Inequitable Institutions.

By Michael Alan Chang and Shiran Dudy.

Published on November 22, 2022.

Introduction.

Thanks for listening. This has been an audio narration of Expansive Participatory AI: Supporting Dreaming within Inequitable Institutions. By Michael Alan Chang and Shiran Dudy. Published on November 22, 2022. Narrated by un. archive dot org, an app made by Sean Ahrens and Claude.
```
451 bytes total. "Introduction." appears as a section heading but the body is entirely absent.

### What the correct output should be
A complete narration of the paper's introduction and full body, approximately 5,000–15,000 characters.

### Root cause (if identifiable)
The hybrid scripter extracts complex elements (figures, tables, equations) and replaces them with `HYBRID_ELEMENT_*` placeholders, then runs the regex pipeline on the remaining prose. If the regex pipeline strips too aggressively (e.g., treating most of the body as boilerplate or academic metadata), the remaining body can be near-empty. The LLM then only generates descriptions for extracted elements, which may also be empty if no elements were extracted. The result: a header + section heading + empty body + footer.

The 628cec3 fix: if the regex-processed body is fewer than 200 characters, fall back to the pure regex pipeline (which at least produces readable prose even if figures are stripped).

---

## Error: Footer uses old domain name "un. archive dot org"

**Goal:** Header/Footer Compliance (Goal 3)
**Severity:** low
**Frequency:** 2/2 papers
**Paper(s):** 2211.12434, 2302.00672

### What the scripter produced
> "Narrated by un. archive dot org, an app made by Sean Ahrens and Claude."

### What the correct output should be
> "Narrated by unarxiv dot org."

### Root cause (if identifiable)
The 628cec3 commit fixed the footer domain in `regex_scripter/script_builder.py`. The hybrid scripter uses a different footer construction path (in `hybrid_scripter/__init__.py` or via `tts_utils.py`) that was not updated. Fix: update the hybrid footer template to use "unarxiv dot org" and remove the attribution suffix, matching the regex tier's corrected footer.

---

## Note: 2302.00672 performs well with current code

For reference, 2302.00672 produced a clean, comprehensive narration (fidelity=9, citations=8, TTS=9). This is the expected hybrid output when the pipeline does not hit the empty-body edge case. No additional errors found beyond the footer domain issue above.
