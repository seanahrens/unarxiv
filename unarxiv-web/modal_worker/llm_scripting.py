"""llm_scripting.py — LLM-powered narration script generation from LaTeX source.

Generates narration scripts directly from the original LaTeX source, chunked
by sections for papers of any length (up to 4+ hours):
  - Splits LaTeX into section-level chunks
  - Processes each chunk independently via LLM
  - Concatenates results into a complete narration script
  - Describes figures, graphs, charts, tables verbally
  - Speaks equations in plain English
  - Covers ALL content — never summarizes

Supported LLM providers:
  - anthropic : Anthropic Claude (default model: claude-sonnet-4-6)
  - openai    : OpenAI GPT (default model: gpt-4o)
  - gemini    : Google Gemini (default model: gemini-1.5-pro)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


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
4. Clean output: Remove all LaTeX formatting commands. Custom macros (commands
   like \\benchname, \\myterm, \\algname) must be replaced: look for their
   \\newcommand definition in the document and substitute the expansion (e.g.,
   \\benchname defined as VTC-Bench → replace all \\benchname with "VTC-Bench").
   If no definition is found, remove the backslash and use the macro name as a
   readable word. Also remove: citation markers [1], [2,3], \\cite{}, \\citep{},
   \\citealt{}; footnote reference commands; \\label{} commands; \\ref{}
   commands (replace with the nearby name if available, else omit); section
   heading commands (\\section{}, \\subsection{}, etc.) — do NOT output the
   heading as a standalone line or label. Also remove or skip all document
   metadata: \\title{}, \\author{}, \\affiliation{}, \\institute{}, \\email{},
   \\icmlauthor{}, \\icmlaffiliation{}, \\maketitle, \\begin{document}, ORCID
   links, and similar preamble content — the title, authors, and date are
   handled by a separate system, do NOT narrate them again.
   Render URLs naturally without saying "dot" or "slash": e.g., the command
   \\href{https://example.org/foo}{example.org/foo} becomes "example.org/foo".
5. Natural speech: Write as if narrating to a listener. Use spoken transitions
   like "Moving on to...", "Next, the authors examine...", "This brings us to..."
   to bridge within-section topic shifts. Do NOT add "Welcome to this section",
   "Welcome to a narrated presentation of...", "Today we will discuss...", or
   "This concludes the section" framing — your output will be concatenated
   with other sections into one continuous narration. Begin narrating directly.
   Never add editorial adjectives like "fascinating", "insightful", or
   "interesting" unless those exact words appear in the source text. Your voice
   is the paper's voice, not a commentator's.
6. Never refuse or add meta-commentary: You are a narration engine, not a
   chatbot. If a chunk contains only a section heading or sparse content, narrate
   whatever is present. NEVER write phrases like "Unfortunately I cannot",
   "Please provide more content", "Sorry, I can only...", "While I cannot
   visually display the figure", or any similar chatbot-style response. Process
   whatever input you receive.
7. Figures without visual access: You cannot see figures, but you can describe
   them from available text. Use the \\caption{} text, data values mentioned in
   adjacent paragraphs, axis labels, and any numbers the authors attribute to the
   figure. Never say "I cannot display the figure." Always produce a concrete
   description. If the caption is the only available information, describe the
   figure type and what a listener would expect to see based on that caption and
   the surrounding discussion.
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
4. Remove citation markers like [1], [2,3], footnote references. Render URLs
   naturally without "dot" or "slash", e.g. "democracylevels.org/system-card".
   Remove any section heading labels (e.g., "Section: Introduction" or "End of
   Section: X") if they appear as standalone lines in the draft.
   Skip all document metadata if present: author lists with affiliations, email
   addresses, title re-introductions. Those belong only in the header.
5. Natural transitions: Add spoken transitions like "Moving on to..." between
   topic shifts, but do NOT add "Welcome to this section", "Today we will
   discuss...", or "This concludes the section" framing. Your output will be
   concatenated with other sections. Never add editorial adjectives like
   "fascinating" or "insightful" unless they appear in the original source.
6. Never refuse or add meta-commentary: You are a narration engine. NEVER write
   phrases like "Unfortunately I cannot", "Please provide more content", "While
   I cannot visually display the figure", or any chatbot-style response. Process
   whatever input you receive.
7. Figures: If the draft says a figure is "shown" without describing it, add a
   description based on what the surrounding text says about the figure. Never
   say you "cannot display" the figure.
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

def _strip_latex_preamble(latex: str) -> str:
    """Strip LaTeX document preamble to avoid narrating author/title metadata.

    Removes everything before \\begin{abstract} or the first \\section{}.
    If neither is found, returns the original text unchanged.
    """
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
# Cost tables (USD per token)
# ---------------------------------------------------------------------------

# claude-sonnet-4-6: $3 / MTok input, $15 / MTok output
_ANTHROPIC_COST_IN = 3.0 / 1_000_000
_ANTHROPIC_COST_OUT = 15.0 / 1_000_000

# gpt-4o: $2.50 / MTok input, $10 / MTok output
_OPENAI_COST_IN = 2.50 / 1_000_000
_OPENAI_COST_OUT = 10.0 / 1_000_000

# gemini-1.5-pro (≤128 K context): $1.25 / MTok input, $5 / MTok output
_GEMINI_COST_IN = 1.25 / 1_000_000
_GEMINI_COST_OUT = 5.0 / 1_000_000


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class LLMResult:
    improved_script: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    provider: str
    model: str


# ---------------------------------------------------------------------------
# Provider protocol + implementations
# ---------------------------------------------------------------------------

@runtime_checkable
class LLMProvider(Protocol):
    def generate_script(self, source: str, is_latex: bool = True) -> LLMResult:
        """Generate a narration script from source (LaTeX or free-tier script)."""
        ...

    # Keep backward compat alias
    def improve_script(self, script: str, raw_source: str | None = None) -> LLMResult:
        ...


def _compute_max_tokens(chunk_chars: int) -> int:
    """Compute max output tokens for a chunk. Narration is roughly 0.3-0.5x
    the LaTeX char count (stripping tags), at ~4 chars/token."""
    estimated_output_chars = int(chunk_chars * 0.5)
    estimated_tokens = estimated_output_chars // 4
    return max(4096, min(estimated_tokens, 16384))


class AnthropicProvider:
    DEFAULT_MODEL = "claude-sonnet-4-6"

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def _call_llm(self, system: str, user: str, max_tokens: int) -> LLMResult:
        import anthropic  # noqa: PLC0415

        client = anthropic.Anthropic(api_key=self._api_key)
        message = client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        improved = message.content[0].text
        in_tok = message.usage.input_tokens
        out_tok = message.usage.output_tokens
        cost = round(in_tok * _ANTHROPIC_COST_IN + out_tok * _ANTHROPIC_COST_OUT, 6)
        return LLMResult(improved, in_tok, out_tok, cost, "anthropic", self._model)

    def generate_script(self, source: str, is_latex: bool = True) -> LLMResult:
        sys_prompt = _SYSTEM_PROMPT if is_latex else _SYSTEM_PROMPT_FALLBACK
        user_tmpl = _USER_TEMPLATE if is_latex else _USER_TEMPLATE_FALLBACK
        user_msg = user_tmpl.format(source=source)
        max_tok = _compute_max_tokens(len(source))
        return self._call_llm(sys_prompt, user_msg, max_tok)

    def improve_script(self, script: str, raw_source: str | None = None) -> LLMResult:
        if raw_source:
            return generate_from_source(self, raw_source, fallback_script=script)
        return self.generate_script(script, is_latex=False)


class OpenAIProvider:
    DEFAULT_MODEL = "gpt-4o"

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def _call_llm(self, system: str, user: str, max_tokens: int) -> LLMResult:
        from openai import OpenAI  # noqa: PLC0415

        client = OpenAI(api_key=self._api_key)
        response = client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        improved = response.choices[0].message.content or ""
        in_tok = response.usage.prompt_tokens
        out_tok = response.usage.completion_tokens
        cost = round(in_tok * _OPENAI_COST_IN + out_tok * _OPENAI_COST_OUT, 6)
        return LLMResult(improved, in_tok, out_tok, cost, "openai", self._model)

    def generate_script(self, source: str, is_latex: bool = True) -> LLMResult:
        sys_prompt = _SYSTEM_PROMPT if is_latex else _SYSTEM_PROMPT_FALLBACK
        user_tmpl = _USER_TEMPLATE if is_latex else _USER_TEMPLATE_FALLBACK
        user_msg = user_tmpl.format(source=source)
        max_tok = _compute_max_tokens(len(source))
        return self._call_llm(sys_prompt, user_msg, max_tok)

    def improve_script(self, script: str, raw_source: str | None = None) -> LLMResult:
        if raw_source:
            return generate_from_source(self, raw_source, fallback_script=script)
        return self.generate_script(script, is_latex=False)


class GeminiProvider:
    DEFAULT_MODEL = "gemini-1.5-pro"

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def _call_llm(self, system: str, user: str, _max_tokens: int) -> LLMResult:
        import google.generativeai as genai  # noqa: PLC0415

        genai.configure(api_key=self._api_key)
        model = genai.GenerativeModel(self._model, system_instruction=system)
        response = model.generate_content(user)
        improved = response.text
        usage = response.usage_metadata
        in_tok = usage.prompt_token_count
        out_tok = usage.candidates_token_count
        cost = round(in_tok * _GEMINI_COST_IN + out_tok * _GEMINI_COST_OUT, 6)
        return LLMResult(improved, in_tok, out_tok, cost, "gemini", self._model)

    def generate_script(self, source: str, is_latex: bool = True) -> LLMResult:
        sys_prompt = _SYSTEM_PROMPT if is_latex else _SYSTEM_PROMPT_FALLBACK
        user_tmpl = _USER_TEMPLATE if is_latex else _USER_TEMPLATE_FALLBACK
        user_msg = user_tmpl.format(source=source)
        max_tok = _compute_max_tokens(len(source))
        return self._call_llm(sys_prompt, user_msg, max_tok)

    def improve_script(self, script: str, raw_source: str | None = None) -> LLMResult:
        if raw_source:
            return generate_from_source(self, raw_source, fallback_script=script)
        return self.generate_script(script, is_latex=False)


# ---------------------------------------------------------------------------
# Section-chunked generation (the core improvement)
# ---------------------------------------------------------------------------

def generate_from_source(
    provider: LLMProvider,
    raw_source: str,
    fallback_script: str | None = None,
) -> LLMResult:
    """Generate a narration script from LaTeX source, chunked by sections.

    For papers of any length — splits LaTeX into section-level chunks,
    processes each through the LLM, and concatenates the results.

    Falls back to chunk-processing the free-tier script if no LaTeX source.
    """
    # Determine source type: LaTeX > PDF text > free-tier script
    has_latex = bool(raw_source and ("\\section" in raw_source or "\\begin{document}" in raw_source))
    has_source = bool(raw_source and len(raw_source.strip()) > 100)

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

    # Process each chunk sequentially
    script_parts: list[str] = []
    total_in_tok = 0
    total_out_tok = 0
    total_cost = 0.0
    result_provider = ""
    result_model = ""

    for i, chunk in enumerate(chunks):
        print(f"[llm] Processing chunk {i + 1}/{len(chunks)} ({len(chunk):,} chars)...")
        result = provider.generate_script(chunk, is_latex=is_latex)
        script_parts.append(result.improved_script)
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


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_PROVIDERS: dict[str, type] = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
}


def get_llm_provider(
    provider_name: str,
    api_key: str,
    model: str | None = None,
) -> LLMProvider:
    """Return an LLMProvider instance for the given provider name."""
    cls = _PROVIDERS.get(provider_name)
    if cls is None:
        raise ValueError(
            f"Unknown LLM provider: {provider_name!r}. "
            f"Choose from: {sorted(_PROVIDERS)}"
        )
    return cls(api_key=api_key, model=model)
