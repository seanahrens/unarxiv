"""models.py — Typed dataclasses for the narration pipeline.

Replaces raw dicts and long function signatures with structured types so
the contract between components is explicit and self-documenting.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field


# ---------------------------------------------------------------------------
# Requests — parsed from incoming trigger payloads
# ---------------------------------------------------------------------------

@dataclass
class NarrationRequest:
    """Parameters for a base (free-tier) narration job."""
    arxiv_id: str
    tex_source_url: str
    callback_url: str
    paper_title: str = ""
    paper_authors: str = ""
    paper_date: str = ""
    parser_preference: str = "latex"
    narration_mode: str = "full"


@dataclass
class UpgradeNarrationRequest(NarrationRequest):
    """Parameters for an upgrade narration job (LLM script + upgrade TTS)."""
    llm_provider: str = "anthropic"
    llm_api_key: str = ""
    llm_model: str = ""
    tts_provider: str = "elevenlabs"
    tts_api_key: str = ""
    version_id: str = ""
    existing_script: str = ""
    scripter_mode: str = "llm"


# ---------------------------------------------------------------------------
# Pipeline results — passed between internal pipeline stages
# ---------------------------------------------------------------------------

@dataclass
class ScriptResult:
    """Output of the scripting stage (regex, LLM, or hybrid)."""
    text: str
    source_type: str  # "latex" or "pdf"
    char_count: int
    # LLM metrics (None for regex-only scripts)
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_cost: float | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None


# ---------------------------------------------------------------------------
# Webhook payload — sent from Modal back to the Cloudflare Worker
# ---------------------------------------------------------------------------

@dataclass
class WebhookPayload:
    """Structured callback payload sent to the Cloudflare Worker webhook.

    Only non-None fields are included when serialized via to_dict().
    """
    arxiv_id: str
    status: str

    # Progress
    eta_seconds: int | None = None
    progress_detail: str | None = None

    # Version
    version_id: str | None = None
    narration_tier: str | None = None

    # Audio
    audio_r2_key: str | None = None
    audio_size_bytes: int | None = None
    duration_seconds: float | None = None

    # Transcript
    transcript_r2_key: str | None = None
    script_char_count: int | None = None

    # LLM metrics
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_cost: float | None = None
    actual_input_tokens: int | None = None
    actual_output_tokens: int | None = None

    # TTS metrics
    tts_provider: str | None = None
    tts_model: str | None = None
    tts_cost: float | None = None

    # Source stats
    tar_bytes: int | None = None
    latex_char_count: int | None = None
    figure_count: int | None = None

    # Pipeline
    scripter_mode: str | None = None
    script_latency_ms: int | None = None

    # Error
    error_message: str | None = None
    error_category: str | None = None

    def to_dict(self) -> dict:
        """Return only non-None fields for the webhook JSON body."""
        return {k: v for k, v in asdict(self).items() if v is not None}
