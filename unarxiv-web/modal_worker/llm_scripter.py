"""llm_scripter.py — LLM-powered narration script generation from LaTeX source.

Generates narration scripts directly from the original LaTeX source, chunked
by sections for papers of any length (up to 4+ hours):
  - Splits LaTeX into section-level chunks
  - Processes each chunk independently via LLM
  - Concatenates results into a complete narration script
  - Describes figures, graphs, charts, tables verbally
  - Speaks equations in plain English
  - Covers ALL content — never summarizes

Provider classes live in llm_providers.py. Figure handling in figure_utils.py.
LaTeX artifact stripping in latex_post_process.py.
"""

from __future__ import annotations

import os
import re

# Re-export provider classes and types for backward compatibility
from llm_providers import (  # noqa: F401
    LLMResult,
    LLMProvider,
    AnthropicProvider,
    OpenAIProvider,
    GeminiProvider,
    get_provider,
)
from figure_utils import build_figure_map, images_for_chunk
from latex_post_process import strip_latex_artifacts

# Backward-compat alias
get_llm_provider = get_provider


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are an expert audio script writer for academic research papers. You will
receive a section of a research paper in LaTeX format. Convert it into a
natural, spoken narration script suitable for text-to-speech audio.

Guidelines:
1. Near-verbatim fidelity: Preserve the authors' exact wording wherever possible.
   Do NOT paraphrase, rewrite, or condense any sentence. The ONLY permitted
   changes are: (a) removing LaTeX markup and commands, (b) expanding inline math
   to spoken English, and (c) describing figures and tables verbally. Every
   sentence in the source must produce a corresponding spoken sentence in the
   output. A listener should hear the paper as the authors wrote it.
   CRITICAL: You are a VOICE ACTOR reading this paper aloud, not a reviewer
   summarizing it. The paper speaks in first person ("we find", "we propose",
   "our method") — you must preserve that voice. NEVER switch to third person
   to describe what "the authors" do. Banned patterns (NEVER write these):
   - "The authors state that...", "The authors present...", "The authors describe..."
   - "The paper discusses...", "The section shows...", "This paragraph covers..."
   - "The study finds...", "The researchers demonstrate...", "The work proposes..."
   - "Starting with the X paragraph, the authors..." (never announce paragraph labels)
   - "The paragraph on X states that..." (never quote yourself narrating)
   Instead, read the source text directly. If the source says "We find that X",
   output "We find that X." If the source says "Our method outperforms Y", output
   "Our method outperforms Y." If a figure caption says "Our pipeline: The goal
   is...", read it as "Our pipeline: The goal is..." — not as a third-person
   description of what the figure shows. This applies to ALL sections: abstract,
   introduction, methods, results, discussion, and appendix alike.
2. Figures and tables: Describe them with enough detail that a listener who
   cannot see them still understands ~75% of the meaning. Requirements:
   - Name specific data values, percentages, and numbers visible in the figure.
   - Describe the visual layout (e.g., "a horizontal bar chart", "a 3-column
     table", "a scatter plot with colored clusters").
   - Highlight relative comparisons (e.g., "X outperforms Y by 8 points", "the
     top three models are within 5 percent of each other").
   - Convey the main visual takeaway, not just the caption text.
   - Example: Instead of "Figure 3 shows model performance", say: "Figure 3 is a
     bar chart showing performance of 7 models. GPT-4o leads at 74 percent,
     followed closely by Gemini-Pro at 71 percent, while the remaining five
     models cluster between 45 and 55 percent. Open-source models consistently
     trail proprietary ones by about 20 points."
   - Use captions, axis labels, and surrounding text to infer any data points
     not explicitly listed in the LaTeX.
3. Equations: Speak mathematical expressions in plain English. For example,
   "x squared plus y squared equals r squared". Convey the mathematical meaning
   without any symbols or LaTeX notation.
   CRITICAL: NEVER output LaTeX math delimiters in your output. This means you
   must NEVER write `\(`, `\)`, `\[`, `\]`, `\begin{equation}`, `\end{equation}`,
   `\begin{align}`, `\end{align}`, `\begin{gather}`, `\end{gather}`, or any other
   LaTeX math environment markers. Convert ALL mathematical notation to spoken
   English BEFORE writing the output. For example:
   - WRONG: "the variable \( z \) is defined as..."
   - RIGHT: "the variable z is defined as..."
   - WRONG: "\[ \hat{v}_\theta = f_\theta(y_t, z, C) \]"
   - RIGHT: "v-hat sub theta equals f sub theta of y sub t, z, and C."
   Every equation environment (`\begin{equation}`, `\begin{align}`, etc.) must be
   converted to a spoken sentence — never passed through as LaTeX.
4. Clean output: Remove all LaTeX formatting commands. If a "Macro definitions"
   block appears at the start of this chunk, use those definitions to expand all
   occurrences of each macro in the text before narrating (e.g., if the block
   says `\ours = BEAVER`, replace every `\ours` with "BEAVER"). Custom macros
   not listed in the block must still be expanded: remove the backslash and use
   the macro name as a readable word (e.g., `\benchname` → "benchname").
   CRITICAL: NEVER output a backslash-prefixed macro name literally (e.g., NEVER
   write `\ours`, `\benchname`, `\algname` in the output — always substitute the
   expansion or the plain word).
   Also remove: citation markers [1], [2,3], \\cite{}, \\citep{},
   \\citealt{}; footnote reference commands; \\label{} commands; ALL cross-
   reference commands including \\ref{}, \\Cref{}, \\cref{}, \\autoref{},
   \\pageref{}, \\eqref{} (omit entirely — do NOT output tilde-separated ref
   names like "~ref~ablation_qual" or "Figure~ref~foo", and do NOT output the
   bare word "Cref" or "cref" either — remove the entire reference including
   surrounding whitespace). CRITICAL: NEVER convert \\ref{label} into the
   word "reference" followed by the label name — that is an artifact.
   "Section reference sec:model" is WRONG. The entire \\ref{} must be
   silently deleted, leaving only the surrounding prose: e.g. "In Section"
   or "Theorem" with no trailing label text.
   IMPORTANT: The plain English word "reference" used as a noun or adjective
   in prose MUST be preserved verbatim. Only the LaTeX command \\ref{label}
   (backslash + "ref" + braces) is deleted — NOT the standalone word
   "reference" in ordinary prose. Examples that must be preserved:
   "reference model", "reference annotation", "reference implementation",
   "reference frame", "ground-truth reference". These are ordinary English
   phrases and must appear in the output unchanged.
   Section heading commands (\\section{}, \\subsection{}, etc.) — do NOT
   output the heading as a standalone line or label.
   CRITICAL — formatting commands: Strip ALL LaTeX text-formatting commands
   and keep only the plain text inside: \\textbf{X} → "X", \\textit{X} → "X",
   \\emph{X} → "X", \\text{X} → "X", \\noindent → (nothing). Do NOT convert
   \\textbf{} or \\textit{} to Markdown bold (**X**) or italic (*X*) — your
   output must contain NO Markdown formatting characters. "**Label.**" in
   output is WRONG. "Label." is correct. TTS engines will speak asterisks
   literally, which is unlistenable.
   Also remove or skip all document metadata:
   \\title{}, \\author{}, \\affiliation{}, \\institute{}, \\email{},
   \\icmlauthor{}, \\icmlaffiliation{}, \\maketitle, \\begin{document}, ORCID
   links, and similar preamble content — the title, authors, and date are
   handled by a separate system, do NOT narrate them again.
   Also skip obvious LaTeX template placeholder content: if you see text that
   appears to be a template example rather than the actual paper (e.g., sample
   citations, example text in multiple languages labeled as examples, placeholder
   instructions like "please see the general instructions"), skip it entirely.
   Render URLs naturally: write the URL as-is without speaking punctuation.
   CRITICAL: Do NOT say "dot", "slash", or "underscore" between URL components.
   Examples:
   - WRONG: "tree dot bio dot ed dot ac dot uk slash software slash figtree"
   - RIGHT: "tree.bio.ed.ac.uk/software/figtree"
   - WRONG: "huggingface dot co slash datasets slash EleutherAI slash my-model"
   - RIGHT: "huggingface.co/datasets/EleutherAI/my-model"
   - WRONG: "icytree dot org"
   - RIGHT: "icytree.org"
   This rule applies to EVERY URL in the chunk — do not apply it to some and
   break it for others. For URLs with mixed-case path components (e.g., GitHub
   repo URLs like "https://github.com/NBISweden/MrBayes"), speak path
   components as words — say "github.com/NBISweden/MrBayes", NOT
   "N-B-I-Sweden" or "M-r-B-a-y-e-s" letter-by-letter. Only spell out letters
   when a path segment is a genuine acronym already read as letters (e.g.,
   "API", "ORCID").
   Also skip visual formatting attributes of document elements: font size,
   font color, bold/italic style, background color, and similar visual design
   properties are invisible to listeners. E.g., if a LaTeX heading is formatted
   in large green bold text, narrate only the heading text, not the formatting.
5. Natural speech: Write as if narrating to a listener. Use spoken transitions
   like "Moving on to...", "Next, we examine...", "This brings us to..."
   to bridge within-section topic shifts. Do NOT add "Welcome to this section",
   "Welcome to a narrated presentation of...", or "Today we will discuss..."
   framing. Your output will be concatenated with other sections into one
   continuous narration. Begin narrating directly.
   CRITICAL — NO SECTION OUTROS: NEVER write any sentence that marks or
   announces the end of a section, topic, or description. This includes ALL
   variants: "This concludes...", "This ends...", "This wraps up...", "This
   brings us to the end of...", "That concludes...", or any phrase beginning
   with "This concludes". Do not end a chunk with a closing summary sentence
   that is not in the source text. Endings that sound like wrap-ups corrupt
   the continuous narration.
   Never add editorial adjectives like "fascinating", "insightful", or
   "interesting" unless those exact words appear in the source text. Your voice
   is the paper's voice, not a commentator's.
6. Never refuse or add meta-commentary: You are a narration engine, not a
   chatbot. NEVER write phrases like "Unfortunately I cannot", "Please provide
   more content", "Sorry, I can only...", "While I cannot visually display the
   figure", or any similar chatbot-style response. Process whatever input you
   receive.
   If a chunk contains ONLY a section heading with no body content (e.g., just
   `\section{Tutorial}` or `\section{Ablation Studies}`), output EXACTLY ONE
   natural transition sentence such as: "Moving on to the tutorial." or "Next,
   the ablation studies." Then stop. Do NOT write "there is no content here",
   "this section contains only a heading", "I will now narrate...", "Start with
   the section title:", "proceed with the content that would be present", or
   anything else meta about the chunk contents.
   If a chunk contains ONLY LaTeX style commands, package imports, custom
   environment definitions, or macro definitions with no readable prose (e.g.,
   all lines are \\usepackage{}, \\newenvironment{}, \\definecolor{}, etc.),
   output an EMPTY STRING — nothing at all. Do NOT explain, do NOT apologize,
   do NOT write "I'm sorry" or "this appears to be template code". Just output
   nothing.
   ALSO: Do NOT output section headings as standalone announcement sentences
   like "The section is titled 'Related Work.'" or "This is the Experiments
   section." Instead, absorb the section heading into a natural spoken transition
   such as "Moving on to related work..." or begin narrating the section content
   directly.
   CRITICAL — NO BARE SECTION LABELS: NEVER write single words like "Abstract.",
   "Introduction.", "Conclusion.", "Methods.", "Results.", or any section name
   as a bare line. These are structural labels, not narration. They must be
   absorbed into transitions: e.g., "The abstract is as follows:" or simply
   begin the abstract text directly.
7. Figures — visual and text-based descriptions:
   When figure images are provided alongside this chunk (as vision inputs), describe
   them based on what you actually see: chart type, axes and their ranges, specific
   data values and bars/lines/points, colour coding, labels, legends, and the main
   visual takeaway. Go beyond the caption — tell the listener what the figure looks
   like and what stands out visually.
   When no image is provided for a figure, describe it from the available text:
   use the \\caption{} text, data values in adjacent paragraphs, axis labels, and
   any numbers the authors attribute to the figure. For structured figures (tables,
   flowcharts, multi-level diagrams) infer the structure explicitly — e.g. "Figure 2
   is a table with 6 rows, one per level labeled L0 through L5. Each row defines..."
   or "Figure 1 shows a three-stage flowchart with arrows connecting..."
   If the surrounding text contains no specific visual details about a figure (no
   caption, no data values, no description beyond a label reference), write ONE
   brief contextualizing sentence using what is known from surrounding prose, e.g.,
   "The paper includes a figure here illustrating the delegation graph structure
   described above." Do NOT write "I cannot provide a description", "no image data
   is available", "the image content is not accessible to me", or any similar
   refusal — this is a narration engine, not a chatbot.
   In all cases: never say "I cannot display the figure", never hedge with "is
   likely showing", and never just restate the caption. Always produce a concrete,
   confident description.
8. All content covered: Narrate ALL content in the section — every paragraph,
   every result, every finding, every discussion point. If a paragraph discusses
   three findings, narrate all three. Do not condense multiple sentences into one.
9. Accuracy: Preserve all technical claims, numbers, method details, and
   conclusions exactly as presented in the source. Do not invent or infer
   findings that are not in the text.

Return ONLY the narration script text. No commentary, preamble, or explanation.\
"""

_USER_TEMPLATE = """\
Here is a section of a research paper in LaTeX:

---
{source}
---

Convert this into a spoken narration script. Cover ALL content comprehensively.
Do not summarize — narrate the full section so a listener learns everything.\
"""

# Fallback: when only a free-tier script is available (no LaTeX source)
_SYSTEM_PROMPT_FALLBACK = """\
You are an expert audio script editor for academic paper narrations. You will
receive a section of a draft narration script for a research paper. Improve it
for audio listening while preserving ALL content.

Guidelines:
1. Near-verbatim fidelity: Preserve the original wording wherever possible.
   Do NOT paraphrase, rewrite, or condense any sentence. The ONLY permitted
   changes are: (a) removing remaining markup or citation artifacts, (b)
   expanding inline math to spoken English, and (c) improving figure/table
   descriptions. Every sentence in the input must produce a corresponding spoken
   sentence in the output.
2. Figures/tables: If a figure is mentioned without a description, add one with
   enough detail that a listener understands ~75% of the meaning without seeing
   it. Name specific data values, describe the visual layout, highlight
   comparisons, and convey the main takeaway. Do not just restate the caption.
3. Equations: Rewrite any remaining symbolic or LaTeX notation into plain spoken
   English (e.g., "x squared plus y squared equals r squared").
   CRITICAL: NEVER output LaTeX math delimiters in your output. NEVER write
   `\(`, `\)`, `\[`, `\]`, `\begin{equation}`, `\end{equation}`, `\begin{align}`,
   or any other LaTeX math environment markers. Convert ALL mathematical notation
   to spoken English BEFORE writing the output.
4. Remove citation markers like [1], [2,3], footnote references. Render URLs
   naturally — write the URL as-is without speaking punctuation. Do NOT say
   "dot", "slash", or "underscore" between URL components:
   - WRONG: "democracylevels dot org slash system-card"
   - RIGHT: "democracylevels.org/system-card"
   - WRONG: "icytree dot org"
   - RIGHT: "icytree.org"
   This rule applies to EVERY URL in the chunk. For URLs with mixed-case path
   components (e.g., "github.com/NBISweden/MrBayes"), speak path components as
   words — do NOT spell letters individually. Also skip visual formatting
   attributes: font size, font color, bold/italic descriptions of document
   elements are not spoken. Remove any section heading labels (e.g.,
   "Section: Introduction" or "End of Section: X") if they appear as standalone
   lines in the draft. Skip all document metadata if present: author lists with
   affiliations, email addresses, title re-introductions.
5. Natural transitions: Add spoken transitions like "Moving on to..." between
   topic shifts, but do NOT add "Welcome to this section" or "Today we will
   discuss..." framing. Your output will be concatenated with other sections.
   CRITICAL — NO SECTION OUTROS: NEVER write any sentence that marks or announces
   the end of a section or topic. This includes ALL variants: "This concludes...",
   "This ends...", "This wraps up...", "That concludes...", or any phrase beginning
   with "This concludes". Do not end a chunk with a closing summary sentence that
   is not in the source. Never add editorial adjectives like "fascinating" or
   "insightful" unless they appear in the original source.
6. Never refuse or add meta-commentary: You are a narration engine. NEVER write
   phrases like "Unfortunately I cannot", "Please provide more content", "While
   I cannot visually display the figure", or any chatbot-style response. Process
   whatever input you receive.
   If a chunk is ONLY a section heading with no body, output ONE short transition
   sentence (e.g., "Moving on to the tutorial.") and stop. Do NOT explain the
   absence of content or meta-narrate your process.
   If a chunk contains ONLY LaTeX style commands, package imports, or macro
   definitions with no readable prose, output an EMPTY STRING. Do NOT write
   "I'm sorry", "I can't assist", or any explanation — just nothing.
   Do NOT output section headings as standalone lines like "The section is titled
   'X'" — absorb them into natural spoken transitions instead.
   CRITICAL — NO BARE SECTION LABELS: NEVER write single words like "Abstract.",
   "Introduction.", "Conclusion.", or any section name as a bare line. Absorb
   them into transitions or begin the content directly.
7. Figures: When figure images are provided as vision inputs, describe what you
   actually see — chart type, axes, data values, labels, colour coding, and the
   main visual takeaway. When no image is provided, describe from surrounding text
   and context. For structured figures (tables, flowcharts, diagrams) infer the
   structure: "Figure 2 is a table with 6 rows..." rather than restating the
   caption. If no visual details are available, write ONE brief contextualizing
   sentence (e.g., "The paper includes a figure here illustrating X."). Never say
   "I cannot provide a description", "no image data is available", or any refusal
   — always produce output, even if brief. Never hedge with "is likely showing".
8. Your output must be at least as long as the input. You are enhancing, not
   condensing. Do not summarize.
9. Preserve all technical accuracy.

Return ONLY the improved script text.\
"""

_USER_TEMPLATE_FALLBACK = """\
Here is a section of a draft narration script:

---
{source}
---

Improve this section for audio narration. Cover ALL content — do not shorten.\
"""

# Maximum chars per chunk sent to the LLM
_MAX_CHUNK_CHARS = 50_000


# ---------------------------------------------------------------------------
# Section splitting
# ---------------------------------------------------------------------------

def _extract_macro_definitions(latex: str) -> str:
    """Extract \\newcommand / \\renewcommand / \\def definitions from LaTeX source.

    Returns a formatted string suitable for injection into the LLM user message
    so the model can expand macros even after the preamble has been stripped.
    Only includes macros that expand to plain readable text (no complex commands).
    """
    # Match \newcommand{\name}[optargs]{definition} and \renewcommand variants
    pattern = re.compile(
        r'\\(?:newcommand|renewcommand|providecommand)\*?\{\\([A-Za-z]+)\}'
        r'(?:\[\d+\])?'
        r'\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
    )
    macros: list[str] = []
    seen: set[str] = set()
    for m in pattern.finditer(latex):
        name = m.group(1)
        defn = m.group(2).strip()
        if name in seen:
            continue
        seen.add(name)
        # Strip common LaTeX wrappers to get readable text
        clean = defn
        clean = re.sub(r'\\text(?:bf|it|rm|sf|tt)?\{([^}]+)\}', r'\1', clean)
        clean = re.sub(r'\\textsc\{([^}]+)\}', r'\1', clean)
        clean = re.sub(r'\\xspace\b', '', clean).strip()
        clean = re.sub(r'\\ensuremath\{([^}]+)\}', r'\1', clean).strip()
        # Only include if the result is plain readable text (no remaining backslash cmds)
        if clean and not re.search(r'\\[a-zA-Z]', clean):
            macros.append(f"\\{name} = {clean}")
    if not macros:
        return ""
    return (
        "Macro definitions (expand these wherever encountered — e.g. if you see "
        "\\ours in the text, replace it with the value shown below):\n"
        + "\n".join(macros)
        + "\n\n"
    )


def _strip_latex_document_tail(latex: str) -> str:
    """Strip everything after \\end{document} to remove template boilerplate.

    LaTeX templates (ACL, ICML, NeurIPS, etc.) often include sample/example
    content after the main paper body in the template file. This tail content
    should not be narrated.
    """
    end_doc = latex.find(r'\end{document}')
    if end_doc != -1:
        return latex[:end_doc]
    return latex


def _strip_latex_preamble(latex: str) -> str:
    """Strip LaTeX document preamble to avoid narrating author/title metadata.

    Removes everything before \\begin{abstract} or the first \\section{}.
    Also strips anything after \\end{document} (template boilerplate).
    If neither start boundary is found, returns the original text unchanged.
    """
    # Strip document tail first (template boilerplate after \end{document})
    latex = _strip_latex_document_tail(latex)

    # Try to find \begin{abstract} first (most papers have one)
    abstract_match = re.search(r'\\begin\{abstract\}', latex)
    if abstract_match:
        return latex[abstract_match.start():]

    # Fall back to first \section, \chapter, etc.
    section_match = re.search(
        r'\\(?:chapter|section)\*?\{',
        latex,
    )
    if section_match:
        return latex[section_match.start():]

    return latex


# Backward-compat aliases for internal functions now in shared modules
_strip_latex_artifacts = strip_latex_artifacts


def _strip_latex_math_delimiters(text: str) -> str:
    """Kept for backward compatibility — delegates to strip_latex_artifacts."""
    return strip_latex_artifacts(text)


def _split_latex_into_sections(latex: str) -> list[str]:
    """Split LaTeX source into section-level chunks.

    Strips the document preamble first (to avoid narrating author/title
    metadata that script_builder.py already handles), then splits on
    \\section, \\subsection, \\chapter boundaries.
    If a section exceeds _MAX_CHUNK_CHARS, sub-splits on \\subsection
    or paragraph (blank line) boundaries.
    """
    latex = _strip_latex_preamble(latex)

    # Pattern matches \section{...}, \subsection{...}, \chapter{...} etc.
    section_pattern = re.compile(
        r'(?=\\(?:chapter|section|subsection|subsubsection)\*?\{)',
        re.MULTILINE,
    )

    parts = section_pattern.split(latex)
    # First part is preamble / abstract (before any \section)
    chunks = [p.strip() for p in parts if p.strip()]

    if not chunks:
        return [latex]

    # Sub-split any chunks that are too large
    result = []
    for chunk in chunks:
        if len(chunk) <= _MAX_CHUNK_CHARS:
            result.append(chunk)
        else:
            # Try splitting on \subsection boundaries first
            sub_pattern = re.compile(r'(?=\\(?:subsection|subsubsection)\*?\{)', re.MULTILINE)
            sub_parts = sub_pattern.split(chunk)
            sub_parts = [p.strip() for p in sub_parts if p.strip()]

            if len(sub_parts) > 1:
                # Recombine sub-parts into chunks under the limit
                current = ""
                for sp in sub_parts:
                    if len(current) + len(sp) > _MAX_CHUNK_CHARS and current:
                        result.append(current)
                        current = sp
                    else:
                        current = (current + "\n\n" + sp).strip()
                if current:
                    result.append(current)
            else:
                # Fall back to paragraph splitting
                result.extend(_split_on_paragraphs(chunk, _MAX_CHUNK_CHARS))

    return result if result else [latex]


def _split_on_paragraphs(text: str, max_chars: int) -> list[str]:
    """Split text into paragraph-aligned chunks under max_chars."""
    chunks = []
    current_parts: list[str] = []
    current_len = 0

    for para in text.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if current_len + len(para) > max_chars and current_parts:
            chunks.append("\n\n".join(current_parts))
            current_parts = [para]
            current_len = len(para)
        else:
            current_parts.append(para)
            current_len += len(para) + 2

    if current_parts:
        chunks.append("\n\n".join(current_parts))
    return chunks


# ---------------------------------------------------------------------------
# Chunk-level LLM call helpers
# ---------------------------------------------------------------------------

def _compute_max_tokens(chunk_chars: int) -> int:
    """Compute max output tokens for a chunk. Narration is roughly 0.3-0.5x
    the LaTeX char count (stripping tags), at ~4 chars/token."""
    estimated_output_chars = int(chunk_chars * 0.5)
    estimated_tokens = estimated_output_chars // 4
    return max(4096, min(estimated_tokens, 16384))


def _generate_chunk(
    provider: LLMProvider,
    source: str,
    is_latex: bool = True,
    images: list[tuple[str, str]] | None = None,
) -> LLMResult:
    """Process a single chunk of source text through the LLM."""
    sys_prompt = _SYSTEM_PROMPT if is_latex else _SYSTEM_PROMPT_FALLBACK
    user_tmpl = _USER_TEMPLATE if is_latex else _USER_TEMPLATE_FALLBACK
    user_msg = user_tmpl.format(source=source)
    max_tok = _compute_max_tokens(len(source))
    return provider._call_llm(sys_prompt, user_msg, max_tok, images=images)


def generate_script(
    provider: LLMProvider,
    raw_source: str,
    fallback_script: str = "",
    figures_dir: str | None = None,
) -> LLMResult:
    """Full LLM rewrite pipeline — the public entry point.

    Generates a narration script from LaTeX source (or free-tier script),
    chunked by sections. This is the function narrate.py calls.
    """
    return generate_from_source(provider, raw_source, fallback_script=fallback_script, figures_dir=figures_dir)


# ---------------------------------------------------------------------------
# Section-chunked generation (the core pipeline)
# ---------------------------------------------------------------------------

def generate_from_source(
    provider: LLMProvider,
    raw_source: str,
    fallback_script: str | None = None,
    figures_dir: str | None = None,
) -> LLMResult:
    """Generate a narration script from LaTeX source, chunked by sections.

    For papers of any length — splits LaTeX into section-level chunks,
    processes each through the LLM, and concatenates the results.

    If figures_dir is provided, figure images referenced via \\includegraphics
    in each chunk are loaded and sent to the LLM as vision inputs, enabling
    concrete visual descriptions instead of caption-only summaries.

    Falls back to chunk-processing the free-tier script if no LaTeX source.
    """
    # Determine source type: LaTeX > PDF text > free-tier script
    has_latex = bool(raw_source and ("\\section" in raw_source or "\\begin{document}" in raw_source))
    has_source = bool(raw_source and len(raw_source.strip()) > 100)

    # Extract macro definitions from the full source BEFORE preamble stripping,
    # so the LLM can expand custom \newcommand macros in every chunk.
    macro_prefix = ""
    if has_latex and raw_source:
        macro_prefix = _extract_macro_definitions(raw_source)
        if macro_prefix:
            print(f"[llm] Extracted macro definitions ({len(macro_prefix)} chars) for injection")

    if has_latex:
        chunks = _split_latex_into_sections(raw_source)
        is_latex = True
        print(f"[llm] Splitting LaTeX into {len(chunks)} section chunks "
              f"(total {len(raw_source):,} chars)")
    elif has_source:
        # PDF-extracted text or other raw source — use the LaTeX prompt
        # (it works well for any academic text, not just LaTeX)
        chunks = _split_on_paragraphs(raw_source, _MAX_CHUNK_CHARS)
        is_latex = True  # use the "convert source to narration" prompt
        print(f"[llm] Splitting PDF/source text into {len(chunks)} chunks "
              f"(total {len(raw_source):,} chars)")
    elif fallback_script:
        chunks = _split_on_paragraphs(fallback_script, _MAX_CHUNK_CHARS)
        is_latex = False
        print(f"[llm] No source — splitting free-tier script into {len(chunks)} chunks "
              f"(total {len(fallback_script):,} chars)")
    else:
        raise ValueError("No source material provided for script generation")

    # Build figure map once if a figures directory was provided
    figure_map: dict[str, str] = {}
    if figures_dir and is_latex:
        figure_map = build_figure_map(figures_dir)
        print(f"[llm] Figure map: {len(figure_map)} entries from {figures_dir}")

    # Process each chunk sequentially
    script_parts: list[str] = []
    total_in_tok = 0
    total_out_tok = 0
    total_cost = 0.0
    result_provider = ""
    result_model = ""

    for i, chunk in enumerate(chunks):
        # Prepend macro definitions so the LLM can expand \newcommand macros
        chunk_with_macros = macro_prefix + chunk if macro_prefix else chunk
        images = images_for_chunk(chunk, figure_map) if figure_map else []
        img_note = f", {len(images)} image(s)" if images else ""
        print(f"[llm] Processing chunk {i + 1}/{len(chunks)} ({len(chunk):,} chars{img_note})...")
        result = _generate_chunk(provider, chunk_with_macros, is_latex=is_latex, images=images or None)
        cleaned = _strip_latex_artifacts(result.improved_script)
        if cleaned != result.improved_script:
            print(f"[llm] WARNING: chunk {i + 1} contained LaTeX artifacts — stripped")
        script_parts.append(cleaned)
        total_in_tok += result.input_tokens
        total_out_tok += result.output_tokens
        total_cost += result.cost_usd
        result_provider = result.provider
        result_model = result.model

    combined = "\n\n".join(script_parts)
    print(f"[llm] Done: {len(chunks)} chunks, {total_in_tok + total_out_tok:,} total tokens, "
          f"${total_cost:.4f}, output {len(combined):,} chars")

    return LLMResult(
        improved_script=combined,
        input_tokens=total_in_tok,
        output_tokens=total_out_tok,
        cost_usd=round(total_cost, 6),
        provider=result_provider,
        model=result_model,
    )


