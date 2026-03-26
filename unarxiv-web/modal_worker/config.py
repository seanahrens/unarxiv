"""config.py — Centralized constants and enums for the narration pipeline.

All tunable parameters live here so there's one place to look for defaults,
limits, and magic numbers. Provider-specific configs (TTS provider chunk sizes,
voices, costs) still live in upgrade_tts.py since they're only used there.
"""

from __future__ import annotations

from enum import Enum


# ---------------------------------------------------------------------------
# Enums — used for validation and IDE autocompletion
# ---------------------------------------------------------------------------

class ScripterMode(str, Enum):
    """Which scripter generates the narration text."""
    REGEX = "regex"
    LLM = "llm"
    HYBRID = "hybrid"


class NarrationMode(str, Enum):
    """What parts of the pipeline to run."""
    FULL = "full"
    SCRIPT_ONLY = "script_only"
    NARRATION_ONLY = "narration_only"


class NarrationTier(str, Enum):
    """Quality tier, determined by TTS + LLM provider combination."""
    BASE = "base"
    PLUS1 = "plus1"
    PLUS2 = "plus2"
    PLUS3 = "plus3"


# ---------------------------------------------------------------------------
# TTS defaults
# ---------------------------------------------------------------------------

#: Default edge-tts voice for free (base-tier) narrations.
FREE_TTS_VOICE = "en-US-GuyNeural"

#: Default edge-tts voice for sponsored upgrade narrations (plus1 tier).
SPONSORED_TTS_VOICE = "en-US-EricNeural"

#: Max characters per free edge-tts chunk.
FREE_TTS_CHUNK_MAX = 4_000

#: Courtesy pause (seconds) between papers in batch mode.
INTER_PAPER_PAUSE = 15


# ---------------------------------------------------------------------------
# LLM scripter
# ---------------------------------------------------------------------------

#: Max characters per LLM call (section-level chunking limit).
LLM_CHUNK_MAX_CHARS = 50_000


# ---------------------------------------------------------------------------
# Figure / image handling
# ---------------------------------------------------------------------------

#: Max bytes per image sent to vision LLMs (5 MB — lowest common denominator).
MAX_IMAGE_BYTES = 5 * 1024 * 1024

#: Max images attached per LLM chunk (keeps cost/latency bounded).
MAX_IMAGES_PER_CHUNK = 5

#: Max pixel dimension per side (Claude's internal processing cap).
MAX_IMAGE_PIXELS = 1568


# ---------------------------------------------------------------------------
# Timeouts (Modal function decorators)
# ---------------------------------------------------------------------------

#: Base narration timeout (1 hour).
BASE_TIMEOUT_SECS = 3_600

#: Upgrade narration timeout (2 hours — LLM + upgrade TTS can both be slow).
UPGRADE_TIMEOUT_SECS = 7_200

#: Max simultaneous upgrade narration containers.
UPGRADE_MAX_CONTAINERS = 4


# ---------------------------------------------------------------------------
# Version IDs
# ---------------------------------------------------------------------------

#: Length of hex version IDs (truncated UUID).
VERSION_ID_LENGTH = 12
