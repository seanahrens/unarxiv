#!/usr/bin/env python3
"""generate_voice_samples.py — Generate voice sample MP3s for the upgrade modal.

Reads API keys from frontend/.env.test.local and produces one MP3 per tier
into frontend/public/samples/. Rerun whenever you change the sample text.

Usage:
    cd unarxiv-web
    python scripts/generate_voice_samples.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Sample text per tier — edit these and rerun to regenerate
# ---------------------------------------------------------------------------

SAMPLE_TEXTS = {
    "elevenlabs": (
        "You're listening to a sample of the Most Lifelike Voice "
        "on unarchive.org, powered by ElevenLabs. "
        "This is how your papers will sound — from complex equations "
        "and inline math to dense theoretical discussions."
    ),
    "openai": (
        "You're listening to a sample of the Polished Voice "
        "on unarchive.org, powered by OpenAI. "
        "This is how your papers will sound — from complex equations "
        "and inline math to dense theoretical discussions."
    ),
    "free": (
        "You're listening to a sample of the Base Voice "
        "on unarchive.org, powered by Microsoft. "
        "This is how your papers will sound — from complex equations "
        "and inline math to dense theoretical discussions."
    ),
}

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent  # unarxiv-web/
ENV_FILE = PROJECT_ROOT / "frontend" / ".env.test.local"
OUTPUT_DIR = PROJECT_ROOT / "frontend" / "public" / "samples"

# Voices (match what premium_tts.py uses)
ELEVENLABS_VOICE = "pNInz6obpgDQGcFmaJgB"  # "Adam" pre-made voice ID
OPENAI_VOICE = "onyx"
FREE_VOICE = "en-US-JennyNeural"


def load_env(path: Path) -> dict[str, str]:
    """Parse a simple KEY=VALUE .env file."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def generate_elevenlabs(text: str, api_key: str, output: Path) -> None:
    """Generate ElevenLabs sample using the elevenlabs SDK."""
    from elevenlabs.client import ElevenLabs

    print(f"  Generating ElevenLabs sample ({ELEVENLABS_VOICE})...")
    client = ElevenLabs(api_key=api_key)
    audio_iter = client.text_to_speech.convert(
        voice_id=ELEVENLABS_VOICE,
        text=text,
        model_id="eleven_multilingual_v2",
        output_format="mp3_44100_128",
    )
    audio_bytes = b"".join(audio_iter)
    output.write_bytes(audio_bytes)
    print(f"  -> {output} ({len(audio_bytes):,} bytes)")


def generate_openai(text: str, api_key: str, output: Path) -> None:
    """Generate OpenAI TTS-HD sample."""
    from openai import OpenAI

    print(f"  Generating OpenAI sample ({OPENAI_VOICE})...")
    client = OpenAI(api_key=api_key)
    response = client.audio.speech.create(
        model="tts-1-hd",
        voice=OPENAI_VOICE,
        input=text,
        response_format="mp3",
    )
    audio_bytes = response.content
    output.write_bytes(audio_bytes)
    print(f"  -> {output} ({len(audio_bytes):,} bytes)")


async def generate_free(text: str, output: Path) -> None:
    """Generate free tier sample using edge-tts (Microsoft)."""
    import edge_tts

    print(f"  Generating Microsoft/edge-tts sample ({FREE_VOICE})...")
    communicate = edge_tts.Communicate(text, FREE_VOICE)
    await communicate.save(str(output))
    size = output.stat().st_size
    print(f"  -> {output} ({size:,} bytes)")


def main() -> None:
    print("Loading API keys from", ENV_FILE)
    env = load_env(ENV_FILE)

    openai_key = env.get("TEST_OPENAI_KEY", "")
    elevenlabs_key = env.get("TEST_ELEVENLABS_KEY", "")

    if not openai_key:
        print("WARNING: TEST_OPENAI_KEY not found, skipping OpenAI sample")
    if not elevenlabs_key:
        print("WARNING: TEST_ELEVENLABS_KEY not found, skipping ElevenLabs sample")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}\n")

    # ElevenLabs
    if elevenlabs_key:
        try:
            generate_elevenlabs(
                SAMPLE_TEXTS["elevenlabs"],
                elevenlabs_key,
                OUTPUT_DIR / "elevenlabs-sample.mp3",
            )
        except Exception as e:
            print(f"  ERROR generating ElevenLabs sample: {e}")

    # OpenAI
    if openai_key:
        try:
            generate_openai(
                SAMPLE_TEXTS["openai"],
                openai_key,
                OUTPUT_DIR / "openai-sample.mp3",
            )
        except Exception as e:
            print(f"  ERROR generating OpenAI sample: {e}")

    # Free (edge-tts) — no API key needed
    try:
        asyncio.run(
            generate_free(
                SAMPLE_TEXTS["free"],
                OUTPUT_DIR / "free-sample.mp3",
            )
        )
    except Exception as e:
        print(f"  ERROR generating free/edge-tts sample: {e}")

    print("\nDone! Sample files are in", OUTPUT_DIR)


if __name__ == "__main__":
    main()
