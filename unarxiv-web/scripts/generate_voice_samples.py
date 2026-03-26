#!/usr/bin/env python3
"""generate_voice_samples.py — Generate voice sample MP3s for the upgrade modal.

Reads tier labels/providers from frontend/src/lib/voiceTiers.ts and API keys
from frontend/.env.test.local. Produces one MP3 per tier into
frontend/public/samples/. Rerun whenever you change the sample text or tiers.

Usage:
    cd unarxiv-web
    python scripts/generate_voice_samples.py
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Sample text template — {label} and {provider} are filled from voiceTiers.ts
# ---------------------------------------------------------------------------

SAMPLE_TEMPLATE = (
    "You're listening to a sample of the {label} "
    "on unarchive.org, powered by {provider}. "
    "This is how your papers will sound — from complex equations "
    "and inline math to dense theoretical discussions."
)

# Which tier IDs to generate samples for
TIER_IDS = ["elevenlabs", "openai", "free"]

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent  # unarxiv-web/
VOICE_TIERS_FILE = PROJECT_ROOT / "frontend" / "src" / "lib" / "voiceTiers.ts"
ENV_FILE = PROJECT_ROOT / "frontend" / ".env.test.local"
OUTPUT_DIR = PROJECT_ROOT / "frontend" / "public" / "samples"

# Voices (match what upgrade_tts.py uses)
ELEVENLABS_VOICE = "pNInz6obpgDQGcFmaJgB"  # "Adam" pre-made voice ID
OPENAI_VOICE = "onyx"
FREE_VOICE = "en-US-JennyNeural"


def parse_voice_tiers(path: Path) -> dict[str, dict[str, str]]:
    """Parse voiceTiers.ts to extract label and providerName per tier ID."""
    content = path.read_text()
    tiers: dict[str, dict[str, str]] = {}

    # Match each tier block:  tierId: { ... }
    block_re = re.compile(
        r'(\w+):\s*\{[^}]*'
        r'label:\s*"([^"]+)"[^}]*'
        r'providerName:\s*"([^"]+)"',
        re.DOTALL,
    )
    for m in block_re.finditer(content):
        tier_id, label, provider = m.group(1), m.group(2), m.group(3)
        tiers[tier_id] = {"label": label, "providerName": provider}

    return tiers


def build_sample_text(label: str, provider: str) -> str:
    """Build sample text from template with lowercase label."""
    return SAMPLE_TEMPLATE.format(label=label.lower(), provider=provider)


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
    # Parse tier info from voiceTiers.ts
    print("Reading tier definitions from", VOICE_TIERS_FILE)
    tiers = parse_voice_tiers(VOICE_TIERS_FILE)
    print(f"  Found tiers: {list(tiers.keys())}\n")

    # Build sample texts from template + tier data
    sample_texts: dict[str, str] = {}
    for tier_id in TIER_IDS:
        tier = tiers.get(tier_id)
        if not tier:
            print(f"  WARNING: tier '{tier_id}' not found in voiceTiers.ts, skipping")
            continue
        text = build_sample_text(tier["label"], tier["providerName"])
        sample_texts[tier_id] = text
        print(f"  {tier_id}: \"{text}\"")

    print()

    # Load API keys
    print("Loading API keys from", ENV_FILE)
    env = load_env(ENV_FILE)

    openai_key = env.get("TEST_OPENAI_KEY", "")
    elevenlabs_key = env.get("TEST_ELEVENLABS_KEY", "")

    if not openai_key:
        print("  WARNING: TEST_OPENAI_KEY not found, skipping OpenAI sample")
    if not elevenlabs_key:
        print("  WARNING: TEST_ELEVENLABS_KEY not found, skipping ElevenLabs sample")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nOutput directory: {OUTPUT_DIR}\n")

    # ElevenLabs
    if elevenlabs_key and "elevenlabs" in sample_texts:
        try:
            generate_elevenlabs(
                sample_texts["elevenlabs"],
                elevenlabs_key,
                OUTPUT_DIR / "elevenlabs-sample.mp3",
            )
        except Exception as e:
            print(f"  ERROR generating ElevenLabs sample: {e}")

    # OpenAI
    if openai_key and "openai" in sample_texts:
        try:
            generate_openai(
                sample_texts["openai"],
                openai_key,
                OUTPUT_DIR / "openai-sample.mp3",
            )
        except Exception as e:
            print(f"  ERROR generating OpenAI sample: {e}")

    # Free (edge-tts) — no API key needed
    if "free" in sample_texts:
        try:
            asyncio.run(
                generate_free(
                    sample_texts["free"],
                    OUTPUT_DIR / "free-sample.mp3",
                )
            )
        except Exception as e:
            print(f"  ERROR generating free/edge-tts sample: {e}")

    print("\nDone! Sample files are in", OUTPUT_DIR)


if __name__ == "__main__":
    main()
