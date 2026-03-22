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
1. Comprehensive coverage: Narrate ALL content in the section — every paragraph,
   every result, every finding, every discussion point. A listener should learn
   everything they would from reading this section of the paper.
2. Figures and tables: Describe what they show verbally. Use phrases like
   "Figure 3 shows...", "The table compares...", followed by key findings and
   trends. Extract descriptions from captions, labels, and surrounding text.
3. Equations: Speak mathematical expressions in plain English. For example,
   "x squared plus y squared equals r squared". Convey the mathematical meaning
   without any symbols or LaTeX notation.
4. Clean output: Remove all LaTeX formatting commands, citation markers like
   [1] or \\cite{}, footnote references, raw URLs, and \\label{} commands.
   Smooth any abrupt transitions.
5. Natural speech: Write as if narrating to a listener. Use spoken transitions
   like "Moving on to...", "Next, the authors examine...", "This brings us to...".
6. Do NOT summarize: Your narration must be comprehensive, not a summary. Cover
   every point the authors make. If a paragraph discusses three findings, narrate
   all three — do not condense them into one sentence.
7. Accuracy: Preserve all technical claims, numbers, method details, and
   conclusions exactly as presented in the source.

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
1. Preserve ALL content — every paragraph, result, and discussion point.
2. Figures/tables: Add verbal descriptions where they are mentioned or skipped.
3. Equations: Rewrite any remaining symbolic notation into plain spoken English.
4. Remove citation markers like [1], footnote references, raw URLs.
5. Add natural spoken transitions between topics.
6. Your output must be at least as long as the input. You are enhancing, not
   condensing. Do not summarize.
7. Preserve all technical accuracy.

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

def _split_latex_into_sections(latex: str) -> list[str]:
    """Split LaTeX source into section-level chunks.

    Splits on \\section, \\subsection, \\chapter boundaries.
    If a section exceeds _MAX_CHUNK_CHARS, sub-splits on \\subsection
    or paragraph (blank line) boundaries.
    """
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
