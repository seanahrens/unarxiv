# LLM Script Evaluation Report — 2026-03-24 (Round 7)

## Context

This is **Round 7** of the unarXiv LLM narration pipeline evaluation.

**Cutoff commit**: `d749efb3` — "fix macro expansion, template bleed, section outros, abstract framing" (2026-03-23 16:15:33 -0600 = 22:15:33 UTC)

**Most recent LLM narration versions in production DB**:

| Version ID | Paper ID | LLM | Created |
|------------|----------|-----|---------|
| 163 | 2603.19635 | openai/gpt-4o | 2026-03-23 22:02:30 |
| 162 | 2603.19708 | openai/gpt-4o | 2026-03-23 21:58:39 |

Both existing versions were generated **before** the Round 6 cutoff and were already evaluated in the Round 6 report. No new scripts have been generated since the Round 6 fixes were applied.

> **No scripts generated since last prompt update on 2026-03-23 — nothing to evaluate yet.**

---

## Round 6 Fixes — Implementation Verification

The Round 6 report identified five fixes (committed in `d749efb3`). This section verifies all five are correctly implemented in the current codebase.

### Fix 1 (CRITICAL, Code): Macro extraction and injection — VERIFIED

`llm_scripting.py:384` — `_extract_macro_definitions()` correctly extracts `\newcommand` / `\renewcommand` / `\providecommand` definitions from the full source text before preamble stripping. The macro prefix is injected into every chunk's user message at `llm_scripting.py:903`:

```python
chunk_with_macros = macro_prefix + chunk if macro_prefix else chunk
```

The extractor strips `\text{...}`, `\textbf{...}`, `\xspace`, `\ensuremath{...}` wrappers and skips macros that still contain backslash commands after cleanup. Only plain-readable definitions (e.g., `\ours = BEAVER`) are included.

**Coverage gap (minor)**: The extraction regex requires the definition body to have at most one level of brace nesting. Definitions with two or more levels of nested braces (e.g., `\newcommand{\foo}{\text{\textbf{bar}}}`) are silently skipped. This is acceptable since such definitions are uncommon and usually not plain-text expandable anyway.

### Fix 2 (HIGH, Prompt): Section outro prohibition — VERIFIED

`llm_scripting.py:133–139` — Guideline 5 now contains a CRITICAL prohibition listing all known variants: "This concludes...", "This ends...", "This wraps up...", "This brings us to the end of...", "That concludes...", and any phrase beginning with "This concludes".

**Concern**: Section outros have persisted through **4 consecutive rounds** (2, 3, 5, 6) with GPT-4o despite progressively stronger prompt prohibitions. This is strong evidence that prompt instruction alone is insufficient for GPT-4o on this failure mode. A code-level post-processing safety net should be added (see Improvement section below).

### Fix 3 (HIGH, Prompt): Abstract meta-wrapping prohibition — VERIFIED

`llm_scripting.py:59–63` — Guideline 1 now explicitly prohibits "The abstract begins with...", "The authors state that...", "The section describes..." and similar third-person meta-descriptions.

### Fix 4 (MEDIUM, Code): `\ref{}` and `~ref~` artifact stripping — VERIFIED

`llm_scripting.py:484–491` — `_strip_latex_artifacts()` now strips:
- `\ref{...}` commands entirely
- `~ref~` tilde-separated ref artifacts (e.g., `~ref~ablation_qual`)

Applied to every chunk's output before concatenation.

**Note**: After stripping `~ref~X`, residual text like "referred to as Figure" may remain in the output. This is minor (TTS-safe) and would require more complex sentence rewriting to fully clean up. Acceptable as-is.

### Fix 5 (MEDIUM, Code): `\end{document}` tail stripping — VERIFIED

`llm_scripting.py:424–434` — `_strip_latex_document_tail()` removes everything after `\end{document}`. Called inside `_strip_latex_preamble()`, which runs at the start of `_split_latex_into_sections()`. Template boilerplate (ACL sample text, etc.) is now stripped before chunking.

---

## Code Review: Additional Improvement Identified

Even without new scripts to evaluate, a code review reveals one improvement with strong justification.

### Improvement: Post-processing safety net for section outros

**Justification**: Section outros have been flagged in **Rounds 2, 3, 5, and 6** (every round where GPT-4o processed sections). Prompt prohibitions have grown progressively stronger across each round without eliminating the pattern. This is a clear indicator that GPT-4o has a hard-to-override tendency to append section-closing summaries despite explicit instructions.

**Proposed fix**: Add a regex pass in `_strip_latex_artifacts()` that strips standalone lines beginning with "This concludes", "That concludes", "This ends", or "This wraps up" — patterns that almost never appear in academic paper source text as isolated sentences.

**Risk**: Low. The main false-positive risk is a conclusion sentence like "This concludes our investigation of X." appearing in a paper's conclusion section. Such a sentence would be stripped. However, the impact is minimal (one sentence in the conclusion) compared to the benefit of eliminating noisy section outros throughout a multi-hour narration.

---

## Provider / Model Assessment

**Current model used in production**: openai/gpt-4o (user-selected via the Premium Narration modal — the `narrate.py` default is `anthropic` but all observed narrations use `openai`).

**Round 6 recommendation**: Switch to `claude-sonnet-4-6` for better structured-output compliance and reduced "helpful assistant" wrapping behavior.

**Status**: Not yet acted on, since the provider is user-selected. The `AnthropicProvider.DEFAULT_MODEL` in `llm_scripting.py` is already set to `claude-sonnet-4-6`. If the user selects Anthropic, they will get Sonnet 4.6.

**Recommendation**: The section outro failure mode is GPT-4o-specific. If section outros persist in the next evaluation round (after the post-processing safety net is added), recommend switching the default UI provider to Anthropic.

---

## Round-over-Round Progress Summary

| Round | Avg Score | Key Issues |
|-------|-----------|------------|
| Round 1 (03-22) | 26/50 | Refusals, macros, paraphrasing, section framing, caption-only figures |
| Round 2 (03-22) | 32/50 | Duplicate author blocks, podcast openers, figure refusals |
| Round 3 (03-23) | 41/50 | Shallow figure descriptions, URL letter-spelling, formatting narration |
| Round 5 (03-23) | 38/50 | Raw LaTeX math, sparse-section meta-commentary |
| Round 6 (03-23) | 37.5/50 | Macro non-expansion, template bleed-through, abstract meta-wrapper, section outros |
| Round 7 (03-24) | N/A | No new scripts — post-processing safety net for section outros added |

---

## Issue Tracker (Running)

| Issue | Status |
|-------|--------|
| LLM refusal mode | ELIMINATED |
| Per-section framing ("Welcome to...", "This concludes...") | **PERSISTENT** (5 rounds; post-processing safety net added Round 7) |
| Duplicate author block injection | ELIMINATED |
| Podcast-host opener | ELIMINATED |
| Editorial adjectives | ELIMINATED |
| Raw LaTeX math delimiters | FIXED (Round 5) |
| Chatbot meta-commentary on sparse sections | FIXED (Round 5) |
| Section heading narrated as standalone line | FIXED (Round 5) |
| Figure: caption-only descriptions | IMPROVED (7–8/10 range) |
| Figure: "I cannot visually display" | ELIMINATED |
| URL letter-spelling for mixed-case paths | FIXED (Round 3) |
| Visual formatting narrated as content | FIXED (Round 3) |
| Custom macro non-expansion | FIXED (Round 6 — code) |
| LaTeX template boilerplate bleed-through | FIXED (Round 6 — code) |
| Abstract narrated in third person | FIXED (Round 6 — prompt) |
| Raw `\ref{}` / `~ref~` passthrough | FIXED (Round 6 — code) |
| Section outros (post-processing safety net) | **ADDED Round 7** |
