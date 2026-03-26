"""upgrade_tts.py — Multi-provider upgrade TTS for unarXiv.

Each provider handles its own authentication, text chunking (respecting
provider-specific character limits), audio generation, and concatenation.

Supported TTS providers:
  - elevenlabs : ElevenLabs (highest quality, ~$0.30 / 1K chars)
  - openai     : OpenAI TTS-HD (~$15 / 1M chars)
  - google     : Google Cloud TTS Neural2 (~$16 / 1M chars), REST API with key
  - polly      : Amazon Polly neural (~$16 / 1M chars), boto3 with IAM creds
  - azure      : Microsoft Azure Speech (~$16 / 1M chars), REST API with key
  - free       : edge-tts (Microsoft Edge TTS, free) — uses existing pipeline

API key formats:
  - elevenlabs / openai / gemini / google: plain API key string
  - polly  : "ACCESS_KEY_ID:SECRET_ACCESS_KEY" or "ACCESS_KEY_ID:SECRET:REGION"
  - azure  : "SUBSCRIPTION_KEY:REGION"  (e.g. "abc123:eastus")
"""

from __future__ import annotations

import io
import os
import subprocess
import tempfile
import time
import xml.sax.saxutils as _saxutils
from dataclasses import dataclass
from typing import Callable, Protocol, runtime_checkable

from config import SPONSORED_TTS_VOICE, FREE_TTS_CHUNK_MAX


# ---------------------------------------------------------------------------
# Per-provider configuration — single source of truth for chunk sizes,
# cost, estimated speed, and default voices.
#
# chunk_max:     max characters per API call
# cost_per_char: USD per character
# secs_per_chunk: estimated wall-clock seconds per chunk (for ETA calculation)
# voice:         default narrator voice
# ---------------------------------------------------------------------------

@dataclass
class ProviderConfig:
    chunk_max: int
    cost_per_char: float
    secs_per_chunk: int
    voice: str


PROVIDER_CONFIGS: dict[str, ProviderConfig] = {
    "elevenlabs": ProviderConfig(
        chunk_max=5_000,
        cost_per_char=0.30 / 1_000,        # $0.30 / 1K chars
        secs_per_chunk=15,
        voice="bIHbv24MWmeRgasZH58o",      # "Will" — premade voice, available on all tiers
    ),
    "openai": ProviderConfig(
        chunk_max=2_000,                    # smaller for ~20s/call + frequent ETA updates
        cost_per_char=15.0 / 1_000_000,     # $15 / 1M chars
        secs_per_chunk=20,
        voice="onyx",
    ),
    "google": ProviderConfig(
        chunk_max=5_000,
        cost_per_char=16.0 / 1_000_000,     # $16 / 1M chars (Neural2)
        secs_per_chunk=10,
        voice="en-US-Neural2-D",
    ),
    "polly": ProviderConfig(
        chunk_max=3_000,
        cost_per_char=16.0 / 1_000_000,     # $16 / 1M chars (neural)
        secs_per_chunk=8,
        voice="Matthew",
    ),
    "azure": ProviderConfig(
        chunk_max=3_000,                    # conservative; SSML overhead ~100 chars
        cost_per_char=16.0 / 1_000_000,     # $16 / 1M chars (neural)
        secs_per_chunk=8,
        voice="en-US-GuyNeural",
    ),
    "free": ProviderConfig(
        chunk_max=FREE_TTS_CHUNK_MAX,
        cost_per_char=0.0,
        secs_per_chunk=5,
        voice=SPONSORED_TTS_VOICE,
    ),
}


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class TTSResult:
    audio_bytes: bytes
    duration_seconds: float
    char_count: int
    cost_usd: float
    provider: str
    voice: str


# ---------------------------------------------------------------------------
# Provider protocol
# ---------------------------------------------------------------------------

# Callback type: (chunks_done, total_chunks, elapsed_seconds) → None
ChunkProgressCallback = Callable[[int, int, float], None]


@runtime_checkable
class TTSProvider(Protocol):
    def synthesize(self, text: str, on_chunk_done: ChunkProgressCallback | None = None) -> TTSResult:
        """Convert text to MP3 audio bytes, optionally reporting per-chunk progress."""
        ...


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

# Chunking logic is shared with tts_utils.split_into_chunks
from tts_utils import split_into_chunks as _chunk_text


def _concatenate_mp3_bytes(chunks: list[bytes]) -> bytes:
    """Concatenate MP3 byte chunks into a single MP3 file using ffmpeg."""
    if len(chunks) == 1:
        return chunks[0]
    with tempfile.TemporaryDirectory() as tmp:
        paths: list[str] = []
        for i, chunk in enumerate(chunks):
            p = os.path.join(tmp, f"chunk_{i:03d}.mp3")
            with open(p, "wb") as f:
                f.write(chunk)
            paths.append(p)
        list_file = os.path.join(tmp, "list.txt")
        with open(list_file, "w") as f:
            f.writelines(f"file '{p}'\n" for p in paths)
        out_path = os.path.join(tmp, "out.mp3")
        result = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
             "-i", list_file, "-acodec", "copy", out_path],
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg concatenation failed: {result.stderr.decode()[:500]}"
            )
        with open(out_path, "rb") as f:
            return f.read()


def _mp3_duration(audio_bytes: bytes) -> float:
    """Return MP3 duration in seconds using mutagen, or 0.0 on failure."""
    try:
        from mutagen.mp3 import MP3  # noqa: PLC0415
        return MP3(io.BytesIO(audio_bytes)).info.length
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------

class ElevenLabsProvider:
    """ElevenLabs TTS — highest quality."""

    _CFG = PROVIDER_CONFIGS["elevenlabs"]

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or self._CFG.voice

    def synthesize(self, text: str, on_chunk_done: ChunkProgressCallback | None = None) -> TTSResult:
        from elevenlabs.client import ElevenLabs  # noqa: PLC0415

        client = ElevenLabs(api_key=self._api_key)
        chunks = _chunk_text(text, self._CFG.chunk_max)
        audio_parts: list[bytes] = []
        t0 = time.monotonic()
        for i, chunk in enumerate(chunks):
            audio_iter = client.text_to_speech.convert(
                voice_id=self._voice,
                text=chunk,
                model_id="eleven_multilingual_v2",
                output_format="mp3_44100_128",
            )
            audio_parts.append(b"".join(audio_iter))
            if on_chunk_done:
                on_chunk_done(i + 1, len(chunks), time.monotonic() - t0)
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * self._CFG.cost_per_char, 6),
            provider="elevenlabs",
            voice=self._voice,
        )


class OpenAITTSProvider:
    """OpenAI TTS-HD."""

    _CFG = PROVIDER_CONFIGS["openai"]

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or self._CFG.voice

    def synthesize(self, text: str, on_chunk_done: ChunkProgressCallback | None = None) -> TTSResult:
        from openai import OpenAI  # noqa: PLC0415

        client = OpenAI(api_key=self._api_key)
        chunks = _chunk_text(text, self._CFG.chunk_max)
        audio_parts: list[bytes] = []
        t0 = time.monotonic()
        for i, chunk in enumerate(chunks):
            response = client.audio.speech.create(
                model="tts-1-hd",
                voice=self._voice,
                input=chunk,
                response_format="mp3",
            )
            audio_parts.append(response.content)
            if on_chunk_done:
                on_chunk_done(i + 1, len(chunks), time.monotonic() - t0)
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * self._CFG.cost_per_char, 6),
            provider="openai",
            voice=self._voice,
        )


class GoogleCloudTTSProvider:
    """Google Cloud Text-to-Speech Neural2 via REST API (~$16 / 1M chars).

    Requires a Cloud TTS API key (not a service account — simpler for Modal).
    """

    _ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize"

    _CFG = PROVIDER_CONFIGS["google"]

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or self._CFG.voice

    def synthesize(self, text: str, on_chunk_done: ChunkProgressCallback | None = None) -> TTSResult:
        import base64  # noqa: PLC0415
        import httpx  # noqa: PLC0415

        # Derive language code from voice name (e.g. "en-US-Neural2-D" → "en-US")
        lang_code = "-".join(self._voice.split("-")[:2])
        chunks = _chunk_text(text, self._CFG.chunk_max)
        audio_parts: list[bytes] = []
        t0 = time.monotonic()
        for i, chunk in enumerate(chunks):
            payload = {
                "input": {"text": chunk},
                "voice": {"languageCode": lang_code, "name": self._voice},
                "audioConfig": {"audioEncoding": "MP3"},
            }
            resp = httpx.post(
                self._ENDPOINT,
                params={"key": self._api_key},
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()
            audio_parts.append(base64.b64decode(resp.json()["audioContent"]))
            if on_chunk_done:
                on_chunk_done(i + 1, len(chunks), time.monotonic() - t0)
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * self._CFG.cost_per_char, 6),
            provider="google",
            voice=self._voice,
        )


class AmazonPollyProvider:
    """Amazon Polly neural TTS via boto3 (~$16 / 1M chars).

    api_key format: "ACCESS_KEY_ID:SECRET_ACCESS_KEY" or
                    "ACCESS_KEY_ID:SECRET_ACCESS_KEY:REGION"
    """

    _CFG = PROVIDER_CONFIGS["polly"]

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or self._CFG.voice

    def _make_client(self):
        import boto3  # noqa: PLC0415

        parts = self._api_key.split(":", 2)
        if len(parts) < 2:
            raise ValueError(
                "Polly api_key must be 'ACCESS_KEY_ID:SECRET_ACCESS_KEY[:REGION]'"
            )
        key_id, secret = parts[0], parts[1]
        region = parts[2] if len(parts) > 2 else "us-east-1"
        return boto3.client(
            "polly",
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            region_name=region,
        )

    def synthesize(self, text: str, on_chunk_done: ChunkProgressCallback | None = None) -> TTSResult:
        client = self._make_client()
        chunks = _chunk_text(text, self._CFG.chunk_max)
        audio_parts: list[bytes] = []
        t0 = time.monotonic()
        for i, chunk in enumerate(chunks):
            response = client.synthesize_speech(
                Text=chunk,
                VoiceId=self._voice,
                OutputFormat="mp3",
                Engine="neural",
            )
            audio_parts.append(response["AudioStream"].read())
            if on_chunk_done:
                on_chunk_done(i + 1, len(chunks), time.monotonic() - t0)
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * self._CFG.cost_per_char, 6),
            provider="polly",
            voice=self._voice,
        )


class AzureSpeechProvider:
    """Microsoft Azure Speech via REST API (~$16 / 1M chars).

    api_key format: "SUBSCRIPTION_KEY:REGION"  (e.g. "abc123:eastus")
    """

    _CFG = PROVIDER_CONFIGS["azure"]

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or self._CFG.voice

    def _parse_key(self) -> tuple[str, str]:
        parts = self._api_key.split(":", 1)
        if len(parts) < 2:
            raise ValueError("Azure api_key must be 'SUBSCRIPTION_KEY:REGION'")
        return parts[0], parts[1]

    def synthesize(self, text: str, on_chunk_done: ChunkProgressCallback | None = None) -> TTSResult:
        import httpx  # noqa: PLC0415

        sub_key, region = self._parse_key()
        endpoint = (
            f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
        )
        # Derive language code from voice name (e.g. "en-US-GuyNeural" → "en-US")
        lang = "-".join(self._voice.split("-")[:2])
        chunks = _chunk_text(text, self._CFG.chunk_max)
        audio_parts: list[bytes] = []
        t0 = time.monotonic()
        for i, chunk in enumerate(chunks):
            # Escape special XML chars in the spoken text
            escaped = _saxutils.escape(chunk)
            ssml = (
                f'<speak version="1.0" xml:lang="{lang}">'
                f'<voice name="{self._voice}">{escaped}</voice>'
                f'</speak>'
            )
            resp = httpx.post(
                endpoint,
                headers={
                    "Ocp-Apim-Subscription-Key": sub_key,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3",
                },
                content=ssml.encode("utf-8"),
                timeout=60,
            )
            resp.raise_for_status()
            audio_parts.append(resp.content)
            if on_chunk_done:
                on_chunk_done(i + 1, len(chunks), time.monotonic() - t0)
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * self._CFG.cost_per_char, 6),
            provider="azure",
            voice=self._voice,
        )


class FreeTTSProvider:
    """edge-tts (Microsoft Edge TTS) — free, uses the existing pipeline."""

    _CFG = PROVIDER_CONFIGS["free"]

    def __init__(self, voice: str | None = None):
        self._voice = voice or self._CFG.voice

    def synthesize(self, text: str, on_chunk_done: ChunkProgressCallback | None = None) -> TTSResult:
        import sys  # noqa: PLC0415
        sys.path.insert(0, "/app")
        import tts_utils  # noqa: PLC0415

        chunks = tts_utils.split_into_chunks(text)
        audio_parts: list[bytes] = []
        t0 = time.monotonic()
        with tempfile.TemporaryDirectory() as tmp:
            for i, chunk in enumerate(chunks):
                path = os.path.join(tmp, f"chunk_{i:03d}.mp3")
                tts_utils._tts_chunk(chunk, path, self._voice)
                with open(path, "rb") as f:
                    audio_parts.append(f.read())
                if on_chunk_done:
                    on_chunk_done(i + 1, len(chunks), time.monotonic() - t0)
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=0.0,
            provider="free",
            voice=self._voice,
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_TTS_PROVIDERS: dict[str, type] = {
    "elevenlabs": ElevenLabsProvider,
    "openai": OpenAITTSProvider,
    "google": GoogleCloudTTSProvider,
    "polly": AmazonPollyProvider,
    "azure": AzureSpeechProvider,
    "free": FreeTTSProvider,
}


def get_tts_provider(
    provider_name: str,
    api_key: str | None = None,
    voice: str | None = None,
) -> TTSProvider:
    """Return a TTSProvider instance for the given provider name.

    Args:
        provider_name: One of "elevenlabs", "openai", "google", "polly", "azure", "free".
        api_key: API key / credential string (never logged or persisted).
                 Not required for "free" provider.
        voice: Optional voice override (uses provider default if omitted).
    """
    cls = _TTS_PROVIDERS.get(provider_name)
    if cls is None:
        raise ValueError(
            f"Unknown TTS provider: {provider_name!r}. "
            f"Choose from: {sorted(_TTS_PROVIDERS)}"
        )
    if provider_name == "free":
        return cls(voice=voice)
    if not api_key:
        raise ValueError(
            f"api_key is required for TTS provider {provider_name!r}"
        )
    return cls(api_key=api_key, voice=voice)
