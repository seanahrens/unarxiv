# Error Catalog — Hybrid Scripter (commit `569cb05`)

Eval date: 2026-03-26 | Papers evaluated: 2 (2211.12434, 2302.00672)

**Note:** 2-paper sample is insufficient for robust evaluation. The catastrophic failure on 2211.12434 dominates the averages. A larger sample is needed to assess hybrid quality fairly.

---

## Error: Catastrophic empty-body failure

**Goal**: Near-Verbatim Fidelity (Goal 1) + Figure/Table Descriptions (Goal 5)
**Severity**: high — entire paper body missing, output is useless
**Frequency**: 1/2 papers (2211.12434)
**Paper(s)**: 2211.12434

### What the scripter produced
```
Expansive Participatory AI: Supporting Dreaming within Inequitable Institutions.

By Michael Alan Chang and Shiran Dudy.

Published on November 22, 2022.

Introduction.

Thanks for listening. This has been an audio narration of Expansive Participatory AI: Supporting Dreaming within Inequitable Institutions. By Michael Alan Chang and Shiran Dudy. Published on November 22, 2022. Narrated by un. archive dot org, an app made by Sean Ahrens and Claude.
```

### What the correct output should be
Full narration of the paper body: abstract, introduction, and all sections. This is a published arXiv paper with substantive content.

### Source material
arXiv 2211.12434 — "Expansive Participatory AI: Supporting Dreaming within Inequitable Institutions" by Michael Alan Chang and Shiran Dudy. A 12-page conference paper.

### Root cause (if identifiable)
The hybrid orchestrator (`hybrid_scripter/__init__.py`) produced only the header, the first section heading "Introduction.", and the footer. The body extraction either returned an empty string or the element extractor consumed all content without generating descriptions. Possible causes:
1. The regex base pipeline returned an empty body after stripping (e.g., paper had unusual LaTeX structure)
2. The element extractor raised an exception that was silently caught, leaving body empty
3. The LLM describer failed for all elements and the fallback left placeholders unreplaced

Fix: Add a post-processing guard in the orchestrator: `if len(body.strip()) < 200: raise ValueError(f"Body too short ({len(body)}), falling back")` and handle the fallback to regex-only mode.

---

## Error: Publication date missing from header and footer

**Goal**: Header/Footer Compliance (Goal 3)
**Severity**: medium — header/footer structurally incomplete
**Frequency**: 1/2 papers (2302.00672)
**Paper(s)**: 2302.00672

### What the scripter produced
```
'Generative CI' through Collective Response Systems.

By Aviv Ovadya.

Motivation.
```
(No "Published on [date]." line)

Footer: "Thanks for listening. This has been an audio narration of 'Generative CI' through Collective Response Systems. By Aviv Ovadya. Narrated by un. archive dot org..."
(No date in footer)

### What the correct output should be
```
'Generative CI' through Collective Response Systems.

By Aviv Ovadya.

Published on [date].

Motivation.
```
Footer should include: "Published on [date]."

### Source material
The paper (arXiv 2302.00672) has a `\date{}` command in the LaTeX source. The arXiv submission date is February 1, 2023.

### Root cause (if identifiable)
The hybrid scripter's metadata extractor returned `None` for `metadata.date`. The `script_builder.py` `build_script()` function likely silently omits the date line when `date is None` rather than using a fallback. Fix: add fallback logic to extract date from arXiv ID format (YYMM → year/month).

---

## Error: Orphaned cross-reference fragment

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: medium — "in sections and" is meaningless to listeners
**Frequency**: 1/2 papers, 1 instance (2302.00672)
**Paper(s)**: 2302.00672

### What the scripter produced
> "A collective response system is a collective intelligence facilitation system that satisfies the structure, processes, properties, and principles described below, in sections and."

### What the correct output should be
> "A collective response system is a collective intelligence facilitation system that satisfies the structure, processes, properties, and principles described below."

### Source material
> `in \Cref{sec:structure} and \Cref{sec:properties}.`

### Root cause (if identifiable)
Same as regex and LLM: `\Cref{}` stripped but surrounding "in sections and" orphan text not cleaned. The cleanup regex does not match this pattern. Same fix as for other tiers: extend cleanup to handle "in sections? and" → "" when both refs are empty.
