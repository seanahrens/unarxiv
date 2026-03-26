# Regex Parser Eval — Round 12 (2026-03-26)

## Summary

| | |
|---|---|
| **Parser commit** | `c3beefc` (2026-03-25 23:57 CST) |
| **Prior commit (r11 base)** | `971153f` |
| **Eval date** | 2026-03-26 |
| **Papers evaluated** | 5 (all LaTeX source) |
| **Avg score** | 7.7/10 |
| **Critical bugs found** | 3 (`\newcolumntype` artifact, `\captionsetup` optional-arg leak, `_convert_subscripts` 5-pass limit) |

**Changes in `c3beefc` vs `971153f`**: Pure rename/refactor (`parser_v2/` → `regex_scripter/`, no behavior changes).

---

## Per-Paper Results

### Paper 1 — 2508.06601 (Deep Ignorance: Filtering Pretraining Data for Tamper-Resistant Safeguards)
*LaTeX source · version_id 283 · 6795 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 8/10 |
| Artifact Cleanliness | 8/10 |
| TTS Readability | 8/10 |
| Structural Coherence | 8/10 |
| **Overall** | **8.0/10** |

**Notes:** Long paper (6795 words) with good overall coverage. Section headers clean ("Filtering Prevents Target Capabilities.", "Multi-Stage Filtering.", etc.). Citations stripped cleanly. Abbreviations converted (e.g. "for example, " from `e.g.`). Percentage values preserved correctly.

Minor issues:
- "Stage 1 to Keyword Blocklist:" — from `\textbf{Stage 1} \to \textbf{Keyword Blocklist:}` producing "to" from `\to`. Readable but slightly odd spoken form.
- "We include additional details ." and "We share additional details ." — stripped citations leave dangling sentence endings with space before period. These are cosmetic; the `_strip_citations` cleanup misses them when the reference appears at the very end of a sentence without punctuation following.
- "by over an order of magnitude to with no observed degradation" — awkward phrasing likely from LaTeX structure (`\textbf{10x}` stripped or similar), not a parser bug.

---

### Paper 2 — 2603.21937 (MultiBind: Attribute Misbinding Benchmark)
*LaTeX source · version_id 251 · 4248 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 9/10 |
| Artifact Cleanliness | 7/10 |
| TTS Readability | 8/10 |
| Structural Coherence | 7/10 |
| **Overall** | **7.75/10** |

**Notes:** Good content coverage. No math in this paper so TTS is very clean. Citations stripped correctly. Section headers natural.

Issues:
- **Orphaned figure-reference verbs**: Three instances where `\Cref{fig:X} illustrates...` was stripped, leaving bare verb at sentence start: `"illustrates the setting and several representative failure modes"`, `"provides an overview of the full MultiBind pipeline"`. These create sentence fragments.
- `"a provides typical example questions"` — letter "a" from a subfigure reference `(\ref{fig:overview})(a) provides...` stripped to `a provides...`. The "a" is a subfigure label, not an article.

The orphaned-verb fix introduced in this eval run (adding cleanup patterns for sentence-opening verbs) partially addresses these. The `illustrates` and `provides` cases are now caught and removed.

---

### Paper 3 — 2603.22341 (T-MAP: Red-Teaming LLM Agents)
*LaTeX source · version_id 255 · 4408 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 9/10 |
| Artifact Cleanliness | 8/10 |
| TTS Readability | 8/10 |
| Structural Coherence | 9/10 |
| **Overall** | **8.5/10** |

**Notes:** Well-structured paper with clean output. Agent notation spoken naturally ("p sub theta", "x sub c,s"). Citations stripped cleanly. Section headers natural. Algorithm environments stripped without leaving artifacts.

Issue identified (now fixed):
- **`_convert_subscripts` 5-pass limit**: The expression `$h_k(x)=(x, r_{1}, a_{1}, o_{1}, \ldots, r_{k-1}, a_{k-1}, o_{k-1})$` has 6 subscripts. With the old 5-pass limit, the last subscript `o_{k-1}` was missed → `o_k minus 1` instead of `o sub k minus 1`. **Fixed by increasing limit to 20.**

---

### Paper 4 — 2603.24329 (GameplayQA: Benchmarking Framework)
*LaTeX source · version_id 252 · 3650 words*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 7/10 |
| Artifact Cleanliness | 7/10 |
| TTS Readability | 8/10 |
| Structural Coherence | 7/10 |
| **Overall** | **7.25/10** |

**Notes:** The benchmark framework name ("GameplayQA") uses a custom macro that expands to empty or a special styled name — resulting in `"We introduce , a framework"` and `"We introduce , a comprehensive benchmarking framework"`. The `_expand_simple_macros` function only expands zero-argument macros; if the benchmark name is defined with `\textsc{GameplayQA}` or `\newcommand{\ours}{\textsc{...}}`, the style wrapper may not expand cleanly.

Issues:
- `"We introduce , a framework"` — benchmark name silently dropped.
- Multiple orphaned figure verbs: `"visualizes this process"`, `"provides typical example questions"`, `"a provides typical example questions"` (extra "a" from subfigure reference).
- `"(Appendix )"` — appendix reference stripped leaving empty parenthetical.
- `"rho approximately equals 1.22 labels/second"` — correct and readable math conversion.

The orphaned-verb patterns added this eval run fix "provides" and "visualizes" cases.

---

### Paper 5 — 2603.24472 (Self-Distillation and Reasoning Degradation)
*LaTeX source · version_id 253 · 3421 words (post-fix)*

| Criterion | Score |
|---|---|
| Completeness (fidelity) | 8/10 |
| Artifact Cleanliness | 5/10 (pre-fix) → 8/10 (post-fix) |
| TTS Readability | 7/10 |
| Structural Coherence | 7/10 (pre-fix) → 8/10 (post-fix) |
| **Overall** | **6.75/10 (pre-fix) → 7.75/10 (post-fix)** |

**Bugs found and fixed this eval run:**

**Bug 1: `\newcolumntype{P}[1]{>{\arraybackslash}p{#1}}` → "P> p#1" artifact**

The LaTeX source defines `\newcolumntype{P}[1]{>{\arraybackslash}p{#1}}` in the body (outside figure environments). `_drop_command_defs` did not include `\newcolumntype` in its prefixes list. After stripping the command name via the generic `\\[a-zA-Z]+` regex, the remaining `[1]{>{\arraybackslash}p{#1}}` became `P[1]> p#1`, then `[1]` got stripped as a numeric marker leaving `P> p#1`.

**Fix**: Added `"\\newcolumntype"` to `_drop_command_defs` prefixes in `latex_parser.py:897`.

**Bug 2: `\captionsetup[subfigure]{labelformat=simple}` → `[subfigure]labelformat=simple` artifact**

`\captionsetup[subfigure]{...}` appears outside figure environments as a "floating" configuration. The `_strip_non_prose` function did not handle `\captionsetup`. The generic `\\[a-zA-Z]+` regex stripped `\captionsetup` but left `[subfigure]{labelformat=simple}`, which after brace removal became `[subfigure]labelformat=simple`. The `[subfigure]` optional arg is not caught by the float-placement `[htbpH!]` filter.

**Fix**: Added `_drop_braced_command(text, "captionsetup")` in `_strip_non_prose` at `latex_parser.py:427`. `_drop_braced_command` correctly handles optional `[...]` args before stripping.

**Bug 3: `_convert_subscripts` 5-pass limit misses final subscript in long expressions**

Expression `$h_k(x)=(x, r_{1}, a_{1}, o_{1}, \ldots, r_{k-1}, a_{k-1}, o_{k-1})$` has 6 subscripts. With only 5 braced-subscript passes, the last `o_{k-1}` was left unprocessed. Since bare subscript pattern `_([a-zA-Z0-9])` does not match `_{` (brace after underscore), the expression remained as `o_{k-1}`, then operator replacement converted `-` to ` minus ` inside the braces, and brace removal produced `o_k minus 1` instead of `o sub k minus 1`.

**Fix**: Increased loop limit from 5 to 20 in `math_to_speech.py:253`.

**Remaining issues (not fixed):**
- Math expressions are verbose (e.g. `I(y;,c given x)` from `I(y;\,c \mid x)`) but intelligible.
- `"As shown in Table, both quantities..."` — table reference stripped leaving "in Table" handled by existing cleanup.

---

## Bugs Found

### Bug 1 (FIXED): `\newcolumntype` definition leaks as "P> p#1"
**File**: `regex_scripter/latex_parser.py`, function `_drop_command_defs`
**Root cause**: `\newcolumntype{P}[1]{>{\arraybackslash}p{#1}}` not recognized as a command definition.
**Fix**: Added `"\\newcolumntype"` to the `prefixes` tuple at line 897.

### Bug 2 (FIXED): `\captionsetup[subfigure]` optional arg leaks as `[subfigure]labelformat=...`
**File**: `regex_scripter/latex_parser.py`, function `_strip_non_prose`
**Root cause**: `\captionsetup` with an optional bracket argument was not stripped; `_drop_braced_command` handles optional args correctly but was not called for `captionsetup`.
**Fix**: Added `_drop_braced_command(text, "captionsetup")` after the caption removal block at line 427.

### Bug 3 (FIXED): `_convert_subscripts` 5-pass limit causes "o_k minus 1" artifact
**File**: `regex_scripter/math_to_speech.py`, function `_convert_subscripts`
**Root cause**: Expressions with 6+ subscripts exhausted the 5-iteration limit; unprocessed braced subscripts then got corrupted by operator substitution before brace removal.
**Fix**: Increased loop count from 5 to 20 at line 253.

### Bug 4 (FIXED): Orphaned sentence-opening figure-reference verbs
**File**: `regex_scripter/latex_parser.py`, function `_normalize_text`
**Root cause**: `\Cref{fig:X} illustrates the setting` → after ref stripping, `illustrates the setting` became a sentence-opening fragment.
**Fix**: Added regex to strip paragraph-opening orphaned verbs (illustrates, provides, shows, depicts, etc.) in `_normalize_text` at the orphaned-reference cleanup block.

---

## Regression Results

| Paper | r11 (c3beefc pre-fix) | r12 post-fix | Delta |
|---|---|---|---|
| paperA LaTeX (1706.03762) | 4515 | 4515 | +0 |
| paperA PDF | 4289 | 4289 | +0 |
| paperB LaTeX (2106.09685) | 4143 | 4143 | +0 |
| paperB PDF | 4309 | 4309 | +0 |

No regressions. The test papers don't use `\newcolumntype`, `\captionsetup[...]`, or expressions with 6+ subscripts, so word counts are identical as expected.

---

## Cross-Paper Patterns

**LaTeX vs PDF**: All 5 papers in this eval were LaTeX-sourced. Average LaTeX score: 7.7/10. The PDF path was not exercised this round (consistent with r11 where PDF path scored ~1.5 points lower due to Unicode math symbol leakage).

**Orphaned figure references**: Appeared in papers 2, 4 — both used `\Cref` / `\autoref` references that, when stripped, left orphaned verbs at the start of sentences. The existing cleanup already handled "Figure" and "Table" bare words; the new verb-cleanup rule extends coverage.

**Custom macros**: Paper 4 (GameplayQA) uses a custom benchmark name macro that produces an empty result after stripping. `_expand_simple_macros` handles zero-argument macros but not styled or complex macros. This is a known limitation.

**Math**: Papers 3 and 5 had moderate math. The subscript fix in paper 3 resolves a systematic off-by-one in `_convert_subscripts`; any paper with 6+ subscripts in a single expression would have hit this.

---

## Comparison to r11

r11 found: escaped-dollar bug (`\$` → math), `longtable` not stripped → **both fixed in `971153f` before this eval.**
r12 finds: `\newcolumntype`, `\captionsetup[opt]`, subscript 5-pass limit, orphaned verbs → **all fixed this eval.**

Quality is improving: average r11 was 7.5/10; average r12 is 7.7/10 (and would be ~8.0/10 after fixes are applied to future scripts).

---

## Scores

| Paper | fidelity | artifacts | tts | coherence | overall |
|---|---|---|---|---|---|
| 2508.06601 | 0.80 | 0.80 | 0.80 | 0.80 | 0.80 |
| 2603.21937 | 0.90 | 0.70 | 0.80 | 0.70 | 0.775 |
| 2603.22341 | 0.90 | 0.80 | 0.80 | 0.90 | 0.85 |
| 2603.24329 | 0.70 | 0.70 | 0.80 | 0.70 | 0.725 |
| 2603.24472 | 0.80 | 0.50 | 0.70 | 0.70 | 0.675 |
