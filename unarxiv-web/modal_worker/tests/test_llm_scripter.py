"""Tests for llm_scripter.py and llm_providers.py — LLM provider factory, _call_llm, and pipeline."""
import sys
import types
from unittest.mock import MagicMock, patch

import pytest

# Ensure modal_worker directory is on the path
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from llm_providers import (
    LLMResult,
    get_provider,
    AnthropicProvider,
    OpenAIProvider,
    GeminiProvider,
)
from llm_scripter import _generate_chunk


# ─── factory tests ────────────────────────────────────────────────────────────

def test_get_provider_anthropic():
    p = get_provider("anthropic", api_key="sk-ant-test")
    assert isinstance(p, AnthropicProvider)


def test_get_provider_openai():
    p = get_provider("openai", api_key="sk-test")
    assert isinstance(p, OpenAIProvider)


def test_get_provider_gemini():
    p = get_provider("gemini", api_key="AIza-test")
    assert isinstance(p, GeminiProvider)


def test_get_provider_unknown():
    with pytest.raises(ValueError, match="Unknown LLM provider"):
        get_provider("badprovider", api_key="x")


def test_get_provider_default_model_anthropic():
    p = get_provider("anthropic", api_key="k")
    assert p._model == AnthropicProvider.DEFAULT_MODEL


def test_get_provider_custom_model():
    p = get_provider("openai", api_key="k", model="gpt-4-turbo")
    assert p._model == "gpt-4-turbo"


# ─── AnthropicProvider ────────────────────────────────────────────────────────

def _make_anthropic_mock(text: str, in_tok: int = 100, out_tok: int = 200):
    """Build a minimal fake anthropic.Anthropic client."""
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text=text)]
    mock_msg.usage.input_tokens = in_tok
    mock_msg.usage.output_tokens = out_tok

    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_msg

    mock_anthropic_mod = MagicMock()
    mock_anthropic_mod.Anthropic.return_value = mock_client
    return mock_anthropic_mod, mock_client


def test_anthropic_generate_chunk():
    mock_mod, mock_client = _make_anthropic_mock("Improved script text", in_tok=50, out_tok=150)
    with patch.dict("sys.modules", {"anthropic": mock_mod}):
        provider = AnthropicProvider(api_key="sk-ant-test")
        result = _generate_chunk(provider, "Draft script", is_latex=False)

    assert isinstance(result, LLMResult)
    assert result.improved_script == "Improved script text"
    assert result.input_tokens == 50
    assert result.output_tokens == 150
    assert result.provider == "anthropic"
    assert result.cost_usd > 0


def test_anthropic_cost_calculation():
    # Haiku default: $0.80/MTok in, $4.00/MTok out
    mock_mod, _ = _make_anthropic_mock("x", in_tok=1_000_000, out_tok=1_000_000)
    with patch.dict("sys.modules", {"anthropic": mock_mod}):
        result = _generate_chunk(AnthropicProvider(api_key="k"), "x", is_latex=False)
    assert abs(result.cost_usd - (0.80 + 4.00)) < 0.01


def test_anthropic_passes_system_prompt():
    mock_mod, mock_client = _make_anthropic_mock("ok")
    with patch.dict("sys.modules", {"anthropic": mock_mod}):
        _generate_chunk(AnthropicProvider(api_key="k"), "script", is_latex=False)
    call_kwargs = mock_client.messages.create.call_args.kwargs
    assert call_kwargs["system"] != ""
    assert "audio" in call_kwargs["system"].lower() or "script" in call_kwargs["system"].lower()


# ─── OpenAIProvider ───────────────────────────────────────────────────────────

def _make_openai_mock(text: str, in_tok: int = 100, out_tok: int = 200):
    mock_choice = MagicMock()
    mock_choice.message.content = text

    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage.prompt_tokens = in_tok
    mock_response.usage.completion_tokens = out_tok

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    mock_openai = MagicMock()
    mock_openai.OpenAI.return_value = mock_client
    return mock_openai, mock_client


def test_openai_generate_chunk():
    mock_mod, _ = _make_openai_mock("OpenAI improved", in_tok=80, out_tok=120)
    with patch.dict("sys.modules", {"openai": mock_mod}):
        result = _generate_chunk(OpenAIProvider(api_key="sk-test"), "draft", is_latex=False)

    assert result.improved_script == "OpenAI improved"
    assert result.input_tokens == 80
    assert result.output_tokens == 120
    assert result.provider == "openai"
    assert result.model == "gpt-4o"


def test_openai_cost_calculation():
    # $2.50/MTok in, $10/MTok out
    mock_mod, _ = _make_openai_mock("x", in_tok=1_000_000, out_tok=1_000_000)
    with patch.dict("sys.modules", {"openai": mock_mod}):
        result = _generate_chunk(OpenAIProvider(api_key="k"), "x", is_latex=False)
    assert abs(result.cost_usd - (2.50 + 10.00)) < 0.01


def test_openai_empty_response_fallback():
    """None response.choices[0].message.content -> empty string."""
    mock_mod, mock_client = _make_openai_mock("ok")
    mock_client.chat.completions.create.return_value.choices[0].message.content = None
    with patch.dict("sys.modules", {"openai": mock_mod}):
        result = _generate_chunk(OpenAIProvider(api_key="k"), "x", is_latex=False)
    assert result.improved_script == ""


# ─── GeminiProvider ──────────────────────────────────────────────────────────

def _make_gemini_mock(text: str, in_tok: int = 100, out_tok: int = 200):
    mock_response = MagicMock()
    mock_response.text = text
    mock_response.usage_metadata.prompt_token_count = in_tok
    mock_response.usage_metadata.candidates_token_count = out_tok

    mock_model_instance = MagicMock()
    mock_model_instance.generate_content.return_value = mock_response

    mock_genai = MagicMock()
    mock_genai.GenerativeModel.return_value = mock_model_instance

    return {"google.generativeai": mock_genai}, mock_model_instance


def test_gemini_generate_chunk():
    modules, _ = _make_gemini_mock("Gemini improved", in_tok=60, out_tok=180)
    with patch.dict("sys.modules", modules):
        result = _generate_chunk(GeminiProvider(api_key="AIza-test"), "draft", is_latex=False)

    assert result.improved_script == "Gemini improved"
    assert result.input_tokens == 60
    assert result.output_tokens == 180
    assert result.provider == "gemini"


def test_gemini_cost_calculation():
    # $1.25/MTok in, $5/MTok out
    modules, _ = _make_gemini_mock("x", in_tok=1_000_000, out_tok=1_000_000)
    with patch.dict("sys.modules", modules):
        result = _generate_chunk(GeminiProvider(api_key="k"), "x", is_latex=False)
    assert abs(result.cost_usd - (1.25 + 5.00)) < 0.01


def test_gemini_passes_system_instruction():
    modules, mock_model_instance = _make_gemini_mock("ok")
    with patch.dict("sys.modules", modules):
        _generate_chunk(GeminiProvider(api_key="k"), "script", is_latex=False)
    genai = sys.modules.get("google.generativeai") or modules["google.generativeai"]
    call_kwargs = genai.GenerativeModel.call_args.kwargs
    assert call_kwargs.get("system_instruction") != ""
