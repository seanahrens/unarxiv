"""llm_providers.py — LLM provider abstraction for narration scripting.

Provides a thin API-call layer for each supported LLM provider. Each provider
class exposes `_call_llm(system, user, max_tokens, images)` — the raw API call
with retry logic and cost tracking. The full scripting pipeline (chunking,
prompts, post-processing) lives in llm_scripter.py.

Supported providers:
  - anthropic : Anthropic Claude (default model: claude-haiku-4-5-20251001)
  - openai    : OpenAI GPT (default model: gpt-4o)
  - gemini    : Google Gemini (default model: gemini-1.5-pro)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


# ---------------------------------------------------------------------------
# Cost tables (USD per token)
# ---------------------------------------------------------------------------

_ANTHROPIC_COSTS = {
    "claude-opus-4-6":             (15.00 / 1_000_000, 75.00 / 1_000_000),
    "claude-sonnet-4-6":           ( 3.00 / 1_000_000, 15.00 / 1_000_000),
    "claude-sonnet-4-5-20250929":  ( 3.00 / 1_000_000, 15.00 / 1_000_000),
    "claude-haiku-4-5-20251001":   ( 0.80 / 1_000_000,  4.00 / 1_000_000),
}
_ANTHROPIC_COST_IN, _ANTHROPIC_COST_OUT = _ANTHROPIC_COSTS["claude-haiku-4-5-20251001"]  # default

# gpt-4o: $2.50 / MTok input, $10 / MTok output
_OPENAI_COST_IN = 2.50 / 1_000_000
_OPENAI_COST_OUT = 10.0 / 1_000_000

# gemini-1.5-pro (<=128 K context): $1.25 / MTok input, $5 / MTok output
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
# Provider protocol
# ---------------------------------------------------------------------------

@runtime_checkable
class LLMProvider(Protocol):
    def _call_llm(
        self,
        system: str,
        user: str,
        max_tokens: int,
        images: list[tuple[str, str]] | None = None,
    ) -> LLMResult:
        """Make a single LLM API call and return the result with cost tracking."""
        ...


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------

class AnthropicProvider:
    DEFAULT_MODEL = "claude-haiku-4-5-20251001"   # best cost/quality: 8.6/10 at ~$0.12/paper, 450k TPM
    HAIKU_MODEL   = "claude-haiku-4-5-20251001"   # same as default
    SONNET_MODEL  = "claude-sonnet-4-6"          # best quality: 15x cost vs haiku-3, 30k TPM limit

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def _call_llm(
        self,
        system: str,
        user: str,
        max_tokens: int,
        images: list[tuple[str, str]] | None = None,
    ) -> LLMResult:
        import time
        import anthropic  # noqa: PLC0415

        client = anthropic.Anthropic(api_key=self._api_key)
        # Build user content: images first, then text
        if images:
            content: list = [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": mt, "data": b64},
                }
                for mt, b64 in images
            ]
            content.append({"type": "text", "text": user})
        else:
            content = user  # type: ignore[assignment]

        # Retry with exponential backoff on rate limit (429) errors.
        # Keeps retrying for up to 30 minutes before giving up.
        _RATE_LIMIT_TIMEOUT = 30 * 60  # 30 minutes total
        _INITIAL_DELAY = 60            # 60s first wait (resets a 1-min token bucket)
        _MAX_DELAY = 300               # cap individual waits at 5 minutes
        deadline = time.monotonic() + _RATE_LIMIT_TIMEOUT
        delay = _INITIAL_DELAY
        attempt = 0
        while True:
            try:
                message = client.messages.create(
                    model=self._model,
                    max_tokens=max_tokens,
                    system=system,
                    messages=[{"role": "user", "content": content}],
                )
                break
            except anthropic.RateLimitError as e:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    print(f"[llm] Rate limit: gave up after 30 minutes of retrying.")
                    raise
                wait = min(delay, remaining)
                attempt += 1
                print(f"[llm] Rate limit hit (attempt {attempt}), "
                      f"retrying in {wait:.0f}s ({remaining:.0f}s budget remaining): {e}")
                time.sleep(wait)
                delay = min(delay * 2, _MAX_DELAY)

        improved = message.content[0].text
        in_tok = message.usage.input_tokens
        out_tok = message.usage.output_tokens
        cost_in, cost_out = _ANTHROPIC_COSTS.get(self._model, (_ANTHROPIC_COST_IN, _ANTHROPIC_COST_OUT))
        cost = round(in_tok * cost_in + out_tok * cost_out, 6)
        return LLMResult(improved, in_tok, out_tok, cost, "anthropic", self._model)


class OpenAIProvider:
    DEFAULT_MODEL = "gpt-4o"

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def _call_llm(
        self,
        system: str,
        user: str,
        max_tokens: int,
        images: list[tuple[str, str]] | None = None,
    ) -> LLMResult:
        from openai import OpenAI  # noqa: PLC0415

        client = OpenAI(api_key=self._api_key)
        # Build user content: images first, then text
        if images:
            user_content: list = [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mt};base64,{b64}",
                        "detail": "low",
                    },
                }
                for mt, b64 in images
            ]
            user_content.append({"type": "text", "text": user})
        else:
            user_content = user  # type: ignore[assignment]
        response = client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
        )
        improved = response.choices[0].message.content or ""
        in_tok = response.usage.prompt_tokens
        out_tok = response.usage.completion_tokens
        cost = round(in_tok * _OPENAI_COST_IN + out_tok * _OPENAI_COST_OUT, 6)
        return LLMResult(improved, in_tok, out_tok, cost, "openai", self._model)


class GeminiProvider:
    DEFAULT_MODEL = "gemini-1.5-pro"

    def __init__(self, api_key: str, model: str | None = None):
        self._api_key = api_key
        self._model = model or self.DEFAULT_MODEL

    def _call_llm(
        self,
        system: str,
        user: str,
        _max_tokens: int,
        images: list[tuple[str, str]] | None = None,
    ) -> LLMResult:
        import google.generativeai as genai  # noqa: PLC0415

        genai.configure(api_key=self._api_key)
        model = genai.GenerativeModel(self._model, system_instruction=system)
        if images:
            parts: list = [
                {"inline_data": {"mime_type": mt, "data": b64}}
                for mt, b64 in images
            ]
            parts.append(user)
            response = model.generate_content(parts)
        else:
            response = model.generate_content(user)
        improved = response.text
        usage = response.usage_metadata
        in_tok = usage.prompt_token_count
        out_tok = usage.candidates_token_count
        cost = round(in_tok * _GEMINI_COST_IN + out_tok * _GEMINI_COST_OUT, 6)
        return LLMResult(improved, in_tok, out_tok, cost, "gemini", self._model)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_PROVIDERS: dict[str, type] = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
}


def get_provider(
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
