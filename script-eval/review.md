# Script Quality Audit

**Papers:**
- Paper A: "Attention Is All You Need" (1706.03762) — math-heavy ML paper
- Paper B: "Datasheets for Datasets" (1803.09010) — text-heavy cs.CY paper

**Scripts generated:** 2 papers × 2 methods = 4 scripts

---

## Paper A: LaTeX path (`paperA_latex.txt`)

### Scores: Completeness 7/10 | Cleanliness 5/10 | Readability 6/10 | TTS-readiness 5/10

### Problems found:

#### 1. `olorred` artifact (line 9)
**Severity: High** — meaningless word in spoken audio

The source LaTeX has `\color{red}` before a copyright notice block. The `_latex_accents_to_unicode` function incorrectly interprets `\c` in `\color` as a cedilla accent command (the bare-accent regex `\\([cHdrukvk])(?=[a-zA-Z])(\w)` matches `\c` + `o`). After the `\c` is consumed (returning just `o`), the remainder `lor` is not cleaned up, and the `{red}` braces are later stripped, producing `olorred`.

```
ACTUAL:   olorred
EXPECTED: (dropped — `\color{red}` is a typographic command, not spoken content)
```

#### 2. Entire reference list present (lines ~390–470)
**Severity: High** — ~80 lines of bibliography entries in audio output

The `thebibliography` LaTeX environment is NOT dropped. Step 12 in `clean_latex` drops `figure`, `table`, and `icmlauthorlist` environments but not `thebibliography`. Step 13 removes the `\begin{thebibliography}` and `\end{thebibliography}` tags but keeps all `\bibitem{key}` entries and formatted citation text. Example:

```
ACTUAL:   press2016using
          Ofir Press and Lior Wolf.
          Using the output embedding to improve language models.
          arXiv preprint arXiv:1608.05859, 2016.

EXPECTED: (entire thebibliography block dropped)
```

#### 3. Appendix mathematical derivations included (lines ~430–480)
**Severity: Medium** — raw math derivation notation leaked into audio

The appendix contains mathematical alignment proofs (`E & = E &By linearity of expectation`, `E)2] & = E - E2`) that are completely opaque when read aloud. These come from `align`/`aligned` environments which are not dropped by `clean_latex`.

```
ACTUAL:   E & = E &By linearity of expectation
          & = EE & Assuming independence
          & = 0
          E)2] & = E - E2
EXPECTED: (entire equation block dropped)
```

#### 4. Unconverted marker token on body text line (line 162)
**Severity: Medium** — "SECTION_START" token read aloud by TTS

The line `SECTION_START Results SECTION_END Machine Translation.` contains a section marker fused with body text. Root cause: step 9 in `clean_latex` strips `\label{...}` commands and their trailing newlines (`[^\n]*\n?`), collapsing `\section{Results}\n\label{sec:results}\nMachine Translation.` into `SECTION_START Results SECTION_END Machine Translation.`. The `_convert_markers_to_speech` function does detect this and extracts `Results Machine Translation.` as the section name, so the token IS converted — but the section title produced would be "Results Machine Translation.." (double period, mashed together).

After careful re-check: this line IS converted but produces a mangled title. The `\label` strip regex should NOT consume the trailing newline.

#### 5. Raw LaTeX align equations (lines 72–76)
**Severity: Medium** — illegible math notation

`align` environment equations (using `&=`) are not dropped — they remain as raw formula fragments:

```
ACTUAL:   MultiHead(Q, K, V) &= Concat(head1, ..., headh)WO
          where headi &= Attention(QW^Qi, KW^Ki, VW^Vi)
          Where the projections are parameter matrices W^Qi R , W^Ki R , W^Vi R and WO R .
EXPECTED: (display math block dropped)
```

#### 6. Escaped underscores `\_` not stripped (lines 149–151)
**Severity: Medium** — TTS reads backslash-underscore literally

`step\_num` in the learning rate formula appears as literal `step\_num` because `\_` (a LaTeX text-mode underscore escape) is not stripped. The regex `\\[a-zA-Z]+\*?` requires letters after `\`, not `_`.

```
ACTUAL:   lrate = model dot
          (step\_num,
          step\_num dot warmup\_steps)
EXPECTED: (display math dropped, or at minimum `\_` → `_`)
```

#### 7. Bare subscript Greek-letter math (line 146)
**Severity: Medium** — numbers stripped of their symbols

`\beta_1=0.9, \beta_2=0.98, \epsilon=10^{-8}` inside inline math gets processed as: `\beta` → removed (step 20), `_1` → `1` (step 16d). Result: `1=0.9 , 2=0.98 and =10`.

```
ACTUAL:   Optimizer We used the Adam optimizer with 1=0.9 , 2=0.98 and =10 .
EXPECTED: (inline math stripped or Greek letters rendered: "beta 1 equals 0.9, beta 2 equals 0.98")
```

#### 8. Double period artifacts (various lines)
**Severity: Low** — minor but audible

Sentences like `model=512 ..` and `P=0.1 ..` have double periods where the sentence-ending period from the original source and a cleanup pass both add one. Not catastrophic but noticeable.

#### 9. Acknowledgments section present
**Severity: Low** — extra content at end

The acknowledgments section IS partially removed by the existing regex, but the "Attention Visualizations" appendix section is included entirely. The appendix strip logic isn't implemented.

#### 10. `figure to figure` reference fragments (minor in B, less in A)
**Severity: Low** — "figure" used with empty refs

After `\ref{}` removal, phrases like "(Figure )" remain with empty parens, and "figure to figure" as text residue.

---

## Paper A: PDF path (`paperA_pdf.txt`)

### Scores: Completeness 7/10 | Cleanliness 4/10 | Readability 6/10 | TTS-readiness 4/10

### Problems found:

#### 1. Inline citation brackets throughout (many lines)
**Severity: High** — "[13]", "[7, 35, 2, 5]" etc. read as "[bracket thirteen bracket]"

```
ACTUAL:   long short-term memory [13] and gated recurrent [7] neural networks
          language modeling and machine translation [35, 2, 5]. Numerous efforts
EXPECTED: long short-term memory and gated recurrent neural networks
          language modeling and machine translation. Numerous efforts
```

#### 2. Contributor footnote block leaked (lines 11–15)
**Severity: High** — long author contribution footnote read as paper body

The `_strip_pdf_title_block` function strips up to the "Abstract" heading but misses the `∗Equal contribution...` footnote block that appears AFTER the abstract in the PDF layout (it's a page-1 footnote rendered before or after the conference header).

```
ACTUAL:   ∗Equal contribution. Listing order is random. Jakob proposed replacing
          RNNs with self-attention...
          31st Conference on Neural Information Processing Systems (NIPS 2017)...
          arXiv:1706.03762v7 [cs.CL] 2 Aug 2023
EXPECTED: (all dropped — author notes, venue info, arXiv stamp)
```

#### 3. arXiv stamp line (line 15)
**Severity: Medium** — `arXiv:1706.03762v7 [cs.CL] 2 Aug 2023` read aloud

#### 4. Subsection number headers as standalone lines (lines 37, 44, 53, 67, 80...)
**Severity: Medium** — "three point one", "three point two" etc. read as numbers

```
ACTUAL:   3.1
          Encoder and Decoder Stacks
EXPECTED: Encoder and Decoder Stacks.
```

#### 5. Running header text (not present in A, but see B)

#### 6. Full table data leaked (lines 320–349)
**Severity: Medium** — table rows with model names and scores rendered as choppy text

```
ACTUAL:   WSJ 23 F1
          Vinyals & Kaiser el al. (2014) [37]
          WSJ only, discriminative
          88.3
          Petrov et al. (2006) [29]
          WSJ only, discriminative
          90.4
EXPECTED: (table dropped or summarized)
```

#### 7. URL present (line 359)
**Severity: Low** — `https://github.com/tensorflow/tensor2tensor` read as URL

#### 8. Acknowledgements section present
**Severity: Low** — existing regex catches section headers but may miss variations

---

## Paper B: LaTeX path (`paperB_latex.txt`)

### Scores: Completeness 8/10 | Cleanliness 7/10 | Readability 8/10 | TTS-readiness 7/10

### Problems found:

#### 1. Acknowledgments section included (lines ~540–570)
**Severity: Medium** — long list of 50+ names read aloud

The existing regex for acknowledgments uses `r"\\section\*?\{Acknowledg(?:e?ments?)\}.*?(?=\\section|\Z)"` which should catch this. But the paper uses `\begin{acks}` environment AND/OR the text wraps. On inspection, the Acknowledgments section IS included in the output. The `\\begin{acks}` strip is there but this paper uses `\section{Acknowledgments}` which should be caught. Looking at the output, the content IS present — the regex may be failing for this paper.

After inspection: this is caught but the paper ALSO has a very long list of names inline in the body of the acknowledgments section. The issue is the regex matches the section but the text wraps across line boundaries making the match fail (the `.*?` in `DOTALL` mode should work though).

Actually on closer inspection the acknowledgments ARE being stripped for paper B — the names at the end of the script are inside a different block. Wait, re-reading the script output, there's `We thank Peter Bailey...` at line ~542 in the output. This IS the acknowledgments section leaking through. This needs investigation.

#### 2. Line-break preservation from multiline LaTeX prose (various)
**Severity: Low** — sentences broken mid-way appear in script

Paper B is written in narrow columns in LaTeX source, so lines break mid-sentence. The current `clean_latex` flow doesn't rejoin these. The `_finalize_speech` collapses 3+ blank lines but doesn't rejoin hard-wrapped prose lines. Example:

```
ACTUAL:   Data plays a critical role in machine learning. Every machine learning
          model is trained and evaluated using data, quite often in the
          form of static datasets.
EXPECTED: Data plays a critical role in machine learning. Every machine learning model is trained and evaluated using data, quite often in the form of static datasets.
```

This is cosmetically awkward but not harmful for TTS (which ignores line breaks). Lower priority.

#### 3. `figure to\nfigure` fragments at end (lines 562–563)
**Severity: Low** — dangling figure references

After `\ref` removal, `"provide in the appendix an example datasheet for Pang and Lee's polarity dataset (figure to figure )."` remains. The phrase `figure to figure` is harmless but confusing.

---

## Paper B: PDF path (`paperB_pdf.txt`)

### Scores: Completeness 7/10 | Cleanliness 5/10 | Readability 7/10 | TTS-readiness 5/10

### Problems found:

#### 1. Inline citation brackets throughout (many lines)
**Severity: High** — same issue as Paper A PDF

```
ACTUAL:   criminal justice [1, 13, 24], hiring [19], critical infrastructure [11, 21]
EXPECTED: criminal justice, hiring, critical infrastructure
```

#### 2. Running header `Gebru et al.` (lines 20, 42, 77, 111, 152...)
**Severity: High** — page-header text read as body content

Short lines `Gebru et al.` appear repeatedly throughout the script as standalone lines (PDF page running headers). These are completely out of context when read aloud.

```
ACTUAL:   Gebru et al.
          dataset be accompanied with a datasheet...
EXPECTED: dataset be accompanied with a datasheet...
```

#### 3. Running title header `Datasheets for Datasets` (multiple pages)
**Severity: Medium** — paper title repeated mid-script

```
ACTUAL:   Datasheets for Datasets

          3.2
          Composition
EXPECTED: Composition.
```

#### 4. Standalone section number headers (lines 23, 50, 62, 89...)
**Severity: Medium** — `1.1`, `3.1`, `3.2`, `3.3` etc. as lone lines

```
ACTUAL:   1.1
          Objectives
EXPECTED: Objectives.
```

#### 5. arXiv stamp (line 18)
**Severity: Low** — `arXiv:1803.09010v8 [cs.DB] 1 Dec 2021`

#### 6. URL inline (line 57)
**Severity: Low** — `https://github.com/TristaCao/into_inclusivecoref/...`

#### 7. Author affiliations block (line 17: "Authors' addresses: Timnit Gebru...")
**Severity: Medium** — affiliation metadata in body

```
ACTUAL:   Authors' addresses: Timnit Gebru, Black in AI; Jamie Morgenstern,
          University of Washington; ...
EXPECTED: (dropped)
```

#### 8. Footnote text inline
**Severity: Medium** — footnote content reads as mid-paragraph parenthetical

```
ACTUAL:   ...and avoid unintentional misuse.1
          We note that in some cases, the people creating a datasheet...
          1We note that in some cases...  [footnote text with number]
```

The `1` footnote marker appears as `misuse.1` (the digit appended to the sentence) and the footnote body `We note...` appears as body text.

---

## Comparative Analysis

### LaTeX vs PDF for Paper A (math-heavy)

| Issue | LaTeX | PDF |
|-------|-------|-----|
| Citation numbers | ✅ Fully removed | ❌ Inline [n] present throughout |
| Math equations | ⚠️ Inline math kept (partially), display math in align leaked | ⚠️ Math rendered via Unicode (better for simple cases) |
| Section structure | ✅ Clean headings | ⚠️ Section numbers (3.1, 3.2.1) as standalone lines |
| References section | ❌ Full bibliography present | ✅ References section removed |
| Author info | ✅ Stripped | ❌ Footnote block leaked |
| Tables | ✅ Dropped | ❌ WSJ parser table rows present |
| Running headers | N/A | ✅ Not present (this paper doesn't have them) |

**Winner: LaTeX path** for Paper A (cleaner overall despite bibliography leak).

### LaTeX vs PDF for Paper B (text-heavy)

| Issue | LaTeX | PDF |
|-------|-------|-----|
| Citation numbers | ✅ Removed | ❌ Inline [n] throughout |
| Prose flow | ✅ Clean prose with good paragraph breaks | ✅ Good (PDF handles prose well) |
| Section structure | ✅ Clear headings | ⚠️ Section numbers + running headers |
| Acknowledgments | ⚠️ Mostly present | ✅ Not clearly present |
| Running headers | N/A | ❌ "Gebru et al." throughout |
| Footnotes | ✅ Stripped | ❌ Mixed into body |

**Winner: LaTeX path** for Paper B (much cleaner).

### Overall Conclusion

**LaTeX path is consistently better** when source is available. Main advantages:
- Citations fully removed (PDFs retain [n] brackets)
- Tables fully dropped
- Structural commands become clean spoken headings

**LaTeX path's critical weaknesses:**
1. Bibliography/thebibliography environment not dropped
2. `align`/`eqnarray` display math not dropped
3. `\color{red}` produces `olorred` (accent regex bug)
4. `\_` escaped underscores not cleaned
5. Greek letter subscripts produce bare numbers

**PDF path's critical weaknesses:**
1. Citation numbers `[n]` not stripped
2. Running headers/footers not stripped
3. Standalone section numbers as lines
4. Footnote text mixed into body
5. Table data (not always caught by the 50% numeric rule)

### Failure modes unique to each method

**LaTeX only:**
- `\color{...}` produces garbage via accent regex false-positive
- `align` / `eqnarray` math environments leak
- `thebibliography` environment not dropped
- Custom command defs that weren't expanded may leak

**PDF only:**
- Two-column layout may produce out-of-order text (partially mitigated by `_rejoin_column_lines`)
- Footnotes mixed into main body (no structural distinction in PDF text stream)
- Running headers/footers indistinguishable from body text without heuristics
- Tables rendered as text rows (the 50% numeric rule misses many)
- Section subsection numbers appear as lone lines
