"""premium_tts.py — Multi-provider premium TTS for unarXiv.

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
import xml.sax.saxutils as _saxutils
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


# ---------------------------------------------------------------------------
# Per-provider chunk limits (characters per API call)
# ---------------------------------------------------------------------------

_ELEVENLABS_CHUNK_MAX = 5_000
_OPENAI_TTS_CHUNK_MAX = 4_096
_GOOGLE_TTS_CHUNK_MAX = 5_000
_POLLY_CHUNK_MAX = 3_000
_AZURE_CHUNK_MAX = 3_000   # conservative; SSML overhead can be ~100 chars


# ---------------------------------------------------------------------------
# Cost per character (USD)
# ---------------------------------------------------------------------------

_ELEVENLABS_COST_PER_CHAR = 0.30 / 1_000         # $0.30 / 1K chars
_OPENAI_TTS_COST_PER_CHAR = 15.0 / 1_000_000     # $15 / 1M chars
_GOOGLE_TTS_COST_PER_CHAR = 16.0 / 1_000_000     # $16 / 1M chars (Neural2)
_POLLY_COST_PER_CHAR = 16.0 / 1_000_000          # $16 / 1M chars (neural)
_AZURE_COST_PER_CHAR = 16.0 / 1_000_000          # $16 / 1M chars (neural)


# ---------------------------------------------------------------------------
# Default voices (narrator-style, clear, professional)
# ---------------------------------------------------------------------------

_ELEVENLABS_DEFAULT_VOICE = "Adam"           # ElevenLabs built-in narrator preset
_OPENAI_TTS_DEFAULT_VOICE = "onyx"          # Deep, authoritative narrator
_GOOGLE_TTS_DEFAULT_VOICE = "en-US-Neural2-D"  # US English male Neural2
_POLLY_DEFAULT_VOICE = "Matthew"            # Amazon Polly neural narrator
_AZURE_DEFAULT_VOICE = "en-US-GuyNeural"   # Azure neural narrator


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

@runtime_checkable
class TTSProvider(Protocol):
    def synthesize(self, text: str) -> TTSResult:
        """Convert text to MP3 audio bytes."""
        ...


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _chunk_text(text: str, max_chars: int) -> list[str]:
    """Split text into paragraph-aligned chunks of at most max_chars each."""
    chunks: list[str] = []
    current_paras: list[str] = []
    current_len = 0
    for para in text.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        if current_len + len(para) > max_chars and current_paras:
            chunks.append("\n\n".join(current_paras))
            current_paras, current_len = [para], len(para)
        else:
            current_paras.append(para)
            current_len += len(para) + 2  # +2 for "\n\n"
    if current_paras:
        chunks.append("\n\n".join(current_paras))
    return chunks


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
    """ElevenLabs TTS — highest quality, ~$0.30 per 1K characters."""

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or _ELEVENLABS_DEFAULT_VOICE

    def synthesize(self, text: str) -> TTSResult:
        from elevenlabs.client import ElevenLabs  # noqa: PLC0415

        client = ElevenLabs(api_key=self._api_key)
        chunks = _chunk_text(text, _ELEVENLABS_CHUNK_MAX)
        audio_parts: list[bytes] = []
        for chunk in chunks:
            audio_iter = client.text_to_speech.convert(
                voice_id=self._voice,
                text=chunk,
                model_id="eleven_multilingual_v2",
                output_format="mp3_44100_128",
            )
            audio_parts.append(b"".join(audio_iter))
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * _ELEVENLABS_COST_PER_CHAR, 6),
            provider="elevenlabs",
            voice=self._voice,
        )


class OpenAITTSProvider:
    """OpenAI TTS-HD — ~$15 per 1M characters."""

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or _OPENAI_TTS_DEFAULT_VOICE

    def synthesize(self, text: str) -> TTSResult:
        from openai import OpenAI  # noqa: PLC0415

        client = OpenAI(api_key=self._api_key)
        chunks = _chunk_text(text, _OPENAI_TTS_CHUNK_MAX)
        audio_parts: list[bytes] = []
        for chunk in chunks:
            response = client.audio.speech.create(
                model="tts-1-hd",
                voice=self._voice,
                input=chunk,
                response_format="mp3",
            )
            audio_parts.append(response.content)
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * _OPENAI_TTS_COST_PER_CHAR, 6),
            provider="openai",
            voice=self._voice,
        )


class GoogleCloudTTSProvider:
    """Google Cloud Text-to-Speech Neural2 via REST API (~$16 / 1M chars).

    Requires a Cloud TTS API key (not a service account — simpler for Modal).
    """

    _ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize"

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or _GOOGLE_TTS_DEFAULT_VOICE

    def synthesize(self, text: str) -> TTSResult:
        import base64  # noqa: PLC0415
        import httpx  # noqa: PLC0415

        # Derive language code from voice name (e.g. "en-US-Neural2-D" → "en-US")
        lang_code = "-".join(self._voice.split("-")[:2])
        chunks = _chunk_text(text, _GOOGLE_TTS_CHUNK_MAX)
        audio_parts: list[bytes] = []
        for chunk in chunks:
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
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * _GOOGLE_TTS_COST_PER_CHAR, 6),
            provider="google",
            voice=self._voice,
        )


class AmazonPollyProvider:
    """Amazon Polly neural TTS via boto3 (~$16 / 1M chars).

    api_key format: "ACCESS_KEY_ID:SECRET_ACCESS_KEY" or
                    "ACCESS_KEY_ID:SECRET_ACCESS_KEY:REGION"
    """

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or _POLLY_DEFAULT_VOICE

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

    def synthesize(self, text: str) -> TTSResult:
        client = self._make_client()
        chunks = _chunk_text(text, _POLLY_CHUNK_MAX)
        audio_parts: list[bytes] = []
        for chunk in chunks:
            response = client.synthesize_speech(
                Text=chunk,
                VoiceId=self._voice,
                OutputFormat="mp3",
                Engine="neural",
            )
            audio_parts.append(response["AudioStream"].read())
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * _POLLY_COST_PER_CHAR, 6),
            provider="polly",
            voice=self._voice,
        )


class AzureSpeechProvider:
    """Microsoft Azure Speech via REST API (~$16 / 1M chars).

    api_key format: "SUBSCRIPTION_KEY:REGION"  (e.g. "abc123:eastus")
    """

    def __init__(self, api_key: str, voice: str | None = None):
        self._api_key = api_key
        self._voice = voice or _AZURE_DEFAULT_VOICE

    def _parse_key(self) -> tuple[str, str]:
        parts = self._api_key.split(":", 1)
        if len(parts) < 2:
            raise ValueError("Azure api_key must be 'SUBSCRIPTION_KEY:REGION'")
        return parts[0], parts[1]

    def synthesize(self, text: str) -> TTSResult:
        import httpx  # noqa: PLC0415

        sub_key, region = self._parse_key()
        endpoint = (
            f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
        )
        # Derive language code from voice name (e.g. "en-US-GuyNeural" → "en-US")
        lang = "-".join(self._voice.split("-")[:2])
        chunks = _chunk_text(text, _AZURE_CHUNK_MAX)
        audio_parts: list[bytes] = []
        for chunk in chunks:
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
        audio_bytes = _concatenate_mp3_bytes(audio_parts)
        char_count = len(text)
        return TTSResult(
            audio_bytes=audio_bytes,
            duration_seconds=_mp3_duration(audio_bytes),
            char_count=char_count,
            cost_usd=round(char_count * _AZURE_COST_PER_CHAR, 6),
            provider="azure",
            voice=self._voice,
        )


class FreeTTSProvider:
    """edge-tts (Microsoft Edge TTS) — free, uses the existing pipeline."""

    def __init__(self, voice: str | None = None):
        self._voice = voice or "en-US-JennyNeural"

    def synthesize(self, text: str) -> TTSResult:
        import sys  # noqa: PLC0415
        sys.path.insert(0, "/app")
        import tex_to_audio  # noqa: PLC0415

        chunks = tex_to_audio._split_into_chunks(text)
        audio_parts: list[bytes] = []
        with tempfile.TemporaryDirectory() as tmp:
            for i, chunk in enumerate(chunks):
                path = os.path.join(tmp, f"chunk_{i:03d}.mp3")
                tex_to_audio._tts_chunk(chunk, path, self._voice)
                with open(path, "rb") as f:
                    audio_parts.append(f.read())
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
