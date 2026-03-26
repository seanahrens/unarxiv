# Error Catalog — Regex Scripter (commit `361fff3`)

Eval date: 2026-03-26 | Papers evaluated: 1 (2603.17198)

---

## Error: Hyperparameter value truncated by math mode parser

**Goal**: Near-Verbatim Fidelity (Goal 1)
**Severity**: high — changes a reported number, producing false information
**Frequency**: 1/1 papers
**Paper(s)**: 2603.17198
**Status**: ⚠️ DEFERRED — deeper math parsing issue; ordinal fix in `628cec3` addresses the `\text{th}` variant but the decimal truncation for `$\alpha = 0.5$` needs separate investigation

### What the scripter produced
> "α = 0."

### What the correct output should be
> "alpha equals 0.5"

### Source material
> `abstraction loss weight of $\alpha = 0.5$`

### Root cause (if identifiable)
LaTeX math mode parsing in `regex_scripter/math_to_speech.py` or `latex_parser.py` truncates the decimal value when the math span ends with `}` immediately after the period separator, treating the period as a sentence terminator and discarding the mantissa. The full token `$\alpha = 0.5$` should produce `"alpha equals 0.5"` but produces `"α = 0."` (also leaving the raw Greek letter rather than the English word).

---

## Error: Double comma from `\ie` / `\eg` macro expansion

**Goal**: Artifact Cleanliness (Goal 2)
**Severity**: medium — audible artifact that disrupts speech cadence
**Frequency**: 1/1 papers (at least 1 occurrence per paper with `\ie` usage)
**Paper(s)**: 2603.17198
**Status**: ✅ FIXED — `628cec3` changes `i\.e\.~?` / `e\.g\.~?` patterns to `i\.e\.~?,?\s*` / `e\.g\.~?,?\s*` to consume trailing comma

### What the scripter produced
> "that is,,"

### What the correct output should be
> "that is,"

### Source material
> LaTeX: `i.e.,` or `\ie,` (the comma after the macro was preserved as well as the substitution's trailing comma)

### Root cause (if identifiable)
`latex_parser._strip_citations()` or `_expand_abbreviations()` replaces `\ie` with `"that is,"` (including trailing comma), but when the surrounding LaTeX already has a comma after the macro (`\ie,`), the result is `"that is,,"`. Fix: strip the comma from the macro expansion and rely on the surrounding punctuation, or consume the following comma as part of the match.

---

## Error: Raw Greek letter not converted to English word

**Goal**: TTS Readability (Goal 4)
**Severity**: medium — TTS engines may mispronounce or skip Greek characters
**Frequency**: 1/1 papers (co-occurs with math truncation error above)
**Paper(s)**: 2603.17198
**Status**: ⚠️ DEFERRED — co-occurs with math truncation; `_convert_greek_letters()` already handles `\alpha` → "alpha" but the math parsing fails before that for this pattern

### What the scripter produced
> "α = 0."

### What the correct output should be
> "alpha equals 0.5"

### Source material
> `$\alpha = 0.5$`

### Root cause (if identifiable)
Same root cause as hyperparameter truncation: the math-to-speech converter for this token fails entirely, leaving the Unicode character `α` (U+03B1) in output. Unicode Greek letters should be transliterated to English names by `math_to_speech.py` as a fallback when full math parsing fails.

---

## Error: Dense technical prose with no TTS normalization

**Goal**: TTS Readability (Goal 4)
**Severity**: low — content is correct but will sound awkward at speech pace
**Frequency**: 1/1 papers
**Paper(s)**: 2603.17198

### What the scripter produced
> "By collapsing many entity-specific samples into a shared symbolic template, each update reinforces a broader equivalence class of relational patterns."

### What the correct output should be
> (No change needed — verbatim is correct, but TTS pacing would benefit from a comma after "template" being present, and short sentence breaks in longer passages)

### Source material
> Source is identical; this is a TTS readability limitation, not a parser bug. The sentence is 26 words with nested abstractions and no natural pause points.

### Root cause (if identifiable)
Regex scripter does not perform sentence-level TTS normalization for complex academic prose. This is a structural limitation of the regex approach, not a fixable bug. Hybrid/LLM scripters are better suited for such passages.

---

## Error: Attribution footer verbosity

**Goal**: Header/Footer Compliance (Goal 3)
**Severity**: low — cosmetic; attribution is appropriate but slightly verbose
**Frequency**: 1/1 papers
**Paper(s)**: 2603.17198
**Status**: ✅ FIXED — `628cec3` changes footer to "Narrated by unarxiv dot org." in `script_builder.py`

### What the scripter produced
> "Narrated by un. archive dot org, an app made by Sean Ahrens and Claude."

### What the correct output should be
> "Narrated by unarxiv.org" (or a shorter form; domain name should not be spelled out letter by letter)

### Source material
> Not in source LaTeX — injected by the narration system footer template.

### Root cause (if identifiable)
The footer template in `script_builder.py` renders the domain name as plain text. TTS systems should read `unarxiv.org` naturally, but the space before the period (`"un. archive dot org"`) suggests the domain name was split somewhere in processing. The `"archive dot org"` form is also unnecessary if the TTS engine handles `.org` correctly.
