"""llm_scripting.py — LLM-powered script improvement for premium narration.

Takes a free-tier narration script (and optionally the original TeX/PDF source)
and uses an LLM to rewrite it for audio listening:
  - Describes figures, graphs, charts, tables with key takeaways
  - Rewrites equations for spoken narration
  - Smooths section transitions
  - Maintains full academic accuracy

Supported LLM providers:
  - anthropic : Anthropic Claude (default model: claude-sonnet-4-6)
  - openai    : OpenAI GPT (default model: gpt-4o)
  - gemini    : Google Gemini (default model: gemini-1.5-pro)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are an expert audio script editor specialising in academic paper narrations.
You will receive a draft narration script for a research paper and must improve it
for audio listening.

Guidelines:
1. Visual content: When the script mentions or skips figures, graphs, charts, or
   tables, provide a moderate verbal description with key takeaways. Use phrases
   like "Figure X shows...", "The graph illustrates...", "The table compares..."
   followed by the core finding or trend.
2. Equations: Rewrite mathematical expressions so they can be spoken naturally.
   Replace LaTeX-style or symbolic notation with plain English (e.g. "x squared
   plus y squared equals r squared"). Convey mathematical meaning without symbols.
3. Transitions: Add natural spoken transitions between sections
   (e.g. "Moving on to...", "Let's now examine...", "This brings us to...").
4. Artifacts: Remove text elements that read poorly aloud — citation markers like
   "[1]", footnote references, raw URLs — and smooth any abrupt section breaks.
5. Accuracy: Preserve all technical content, findings, methods, and conclusions
   exactly. Do not simplify, editorialize, or omit any important content.

Return ONLY the improved script text. Do not include any commentary, preamble,
or explanation outside the script itself.\
"""

_USER_TEMPLATE_SCRIPT_ONLY = """\
Here is the draft narration script for the paper:

---
{script}
---

Please improve this script for audio narration following the guidelines provided.\
"""

_USER_TEMPLATE_WITH_SOURCE = """\
Here is the original TeX source (use it to find figure captions, table content,
and equation context that may have been stripped from the draft):

--- TeX SOURCE ---
{raw_source}
--- END SOURCE ---

Here is the draft narration script to improve:

---
{script}
---

Please improve the script for audio narration, using the TeX source to fill in
any visual descriptions or equation details that are missing.\
"""

# Maximum characters of raw source to include in the prompt (avoid huge contexts).
_MAX_SOURCE_CHARS_IN_PROMPT = 60_000


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
    def improve_script(self, script: str, raw_source: str | None = None) -> LLMResult:
        """Return an improved narration script."""
        ...


def _build_user_message(script: str, raw_source: str | None) -> str:
    """Build the user prompt, including source context if provided and not too long."""
    if raw_source and len(raw_source) <= _MAX_SOURCE_CHARS_IN_PROMPT:
        return _USER_TEMPLATE_WITH_SOURCE.format(script=script, raw_source=raw_source)
    return _USER_TEMPLATE_SCRIPT_ONLY.format(script=script)


class AnthropicProvider:
    DEFAULT_MODEL = "claude-sonnet-4-6"

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def improve_script(self, script: str, raw_source: str | None = None) -> LLMResult:
        import anthropic  # noqa: PLC0415

        client = anthropic.Anthropic(api_key=self._api_key)
        message = client.messages.create(
            model=self._model,
            max_tokens=8192,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _build_user_message(script, raw_source)}],
        )
        improved = message.content[0].text
        in_tok = message.usage.input_tokens
        out_tok = message.usage.output_tokens
        cost = round(in_tok * _ANTHROPIC_COST_IN + out_tok * _ANTHROPIC_COST_OUT, 6)
        return LLMResult(
            improved_script=improved,
            input_tokens=in_tok,
            output_tokens=out_tok,
            cost_usd=cost,
            provider="anthropic",
            model=self._model,
        )


class OpenAIProvider:
    DEFAULT_MODEL = "gpt-4o"

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def improve_script(self, script: str, raw_source: str | None = None) -> LLMResult:
        from openai import OpenAI  # noqa: PLC0415

        client = OpenAI(api_key=self._api_key)
        response = client.chat.completions.create(
            model=self._model,
            max_tokens=8192,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_message(script, raw_source)},
            ],
        )
        improved = response.choices[0].message.content or ""
        in_tok = response.usage.prompt_tokens
        out_tok = response.usage.completion_tokens
        cost = round(in_tok * _OPENAI_COST_IN + out_tok * _OPENAI_COST_OUT, 6)
        return LLMResult(
            improved_script=improved,
            input_tokens=in_tok,
            output_tokens=out_tok,
            cost_usd=cost,
            provider="openai",
            model=self._model,
        )


class GeminiProvider:
    DEFAULT_MODEL = "gemini-1.5-pro"

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def improve_script(self, script: str, raw_source: str | None = None) -> LLMResult:
        import google.generativeai as genai  # noqa: PLC0415

        genai.configure(api_key=self._api_key)
        model = genai.GenerativeModel(
            self._model,
            system_instruction=_SYSTEM_PROMPT,
        )
        response = model.generate_content(_build_user_message(script, raw_source))
        improved = response.text
        usage = response.usage_metadata
        in_tok = usage.prompt_token_count
        out_tok = usage.candidates_token_count
        cost = round(in_tok * _GEMINI_COST_IN + out_tok * _GEMINI_COST_OUT, 6)
        return LLMResult(
            improved_script=improved,
            input_tokens=in_tok,
            output_tokens=out_tok,
            cost_usd=cost,
            provider="gemini",
            model=self._model,
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
    """Return an LLMProvider instance for the given provider name.

    Args:
        provider_name: One of "anthropic", "openai", "gemini".
        api_key: API key for the provider (never logged or persisted).
        model: Optional model override (uses provider default if omitted).
    """
    cls = _PROVIDERS.get(provider_name)
    if cls is None:
        raise ValueError(
            f"Unknown LLM provider: {provider_name!r}. "
            f"Choose from: {sorted(_PROVIDERS)}"
        )
    return cls(api_key=api_key, model=model)
