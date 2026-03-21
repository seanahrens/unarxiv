"""Tests for premium_tts.py — TTS provider factory, helpers, and implementations."""
import sys
from unittest.mock import MagicMock, patch, call

import pytest

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from premium_tts import (
    TTSResult,
    _chunk_text,
    get_tts_provider,
    ElevenLabsProvider,
    OpenAITTSProvider,
    GoogleCloudTTSProvider,
    AmazonPollyProvider,
    AzureSpeechProvider,
    FreeTTSProvider,
    _ELEVENLABS_CHUNK_MAX,
    _OPENAI_TTS_CHUNK_MAX,
    _GOOGLE_TTS_CHUNK_MAX,
    _POLLY_CHUNK_MAX,
    _AZURE_CHUNK_MAX,
)


# ─── _chunk_text ─────────────────────────────────────────────────────────────

def test_chunk_text_short_text_single_chunk():
    result = _chunk_text("Short paragraph.", max_chars=100)
    assert len(result) == 1
    assert result[0] == "Short paragraph."


def test_chunk_text_splits_at_paragraph_boundary():
    # Two paragraphs that together exceed the limit
    para1 = "A" * 50
    para2 = "B" * 50
    text = f"{para1}\n\n{para2}"
    chunks = _chunk_text(text, max_chars=60)
    assert len(chunks) == 2
    assert para1 in chunks[0]
    assert para2 in chunks[1]


def test_chunk_text_preserves_all_content():
    paras = [f"Paragraph number {i} with some text." for i in range(10)]
    text = "\n\n".join(paras)
    chunks = _chunk_text(text, max_chars=100)
    # All paragraph text should appear somewhere in chunks
    for para in paras:
        assert any(para in c for c in chunks)


def test_chunk_text_empty_string():
    assert _chunk_text("", max_chars=100) == []


def test_chunk_text_only_whitespace():
    assert _chunk_text("   \n\n  \n\n  ", max_chars=100) == []


def test_chunk_text_single_paragraph_exceeds_limit():
    """A single paragraph longer than max_chars stays as one chunk (can't split mid-para)."""
    long_para = "X" * 200
    chunks = _chunk_text(long_para, max_chars=100)
    assert len(chunks) == 1
    assert chunks[0] == long_para


# ─── factory tests ────────────────────────────────────────────────────────────

def test_get_tts_provider_elevenlabs():
    assert isinstance(get_tts_provider("elevenlabs", api_key="el-key"), ElevenLabsProvider)


def test_get_tts_provider_openai():
    assert isinstance(get_tts_provider("openai", api_key="sk-key"), OpenAITTSProvider)


def test_get_tts_provider_google():
    assert isinstance(get_tts_provider("google", api_key="AIza"), GoogleCloudTTSProvider)


def test_get_tts_provider_polly():
    assert isinstance(get_tts_provider("polly", api_key="AKID:SECRET"), AmazonPollyProvider)


def test_get_tts_provider_azure():
    assert isinstance(get_tts_provider("azure", api_key="key:eastus"), AzureSpeechProvider)


def test_get_tts_provider_free():
    assert isinstance(get_tts_provider("free"), FreeTTSProvider)


def test_get_tts_provider_unknown():
    with pytest.raises(ValueError, match="Unknown TTS provider"):
        get_tts_provider("notaprovider", api_key="x")


def test_get_tts_provider_requires_api_key_for_paid():
    for provider in ["elevenlabs", "openai", "google", "polly", "azure"]:
        with pytest.raises(ValueError, match="api_key"):
            get_tts_provider(provider)  # no api_key


def test_get_tts_provider_free_no_api_key_required():
    p = get_tts_provider("free")  # must not raise
    assert isinstance(p, FreeTTSProvider)


# ─── helper: fake MP3 bytes (just non-empty bytes — _mp3_duration returns 0) ──

FAKE_MP3 = b"\xff\xfb\x90\x00" + b"\x00" * 100  # minimal "MP3-ish" bytes


def _mock_concatenate(chunks):
    """Test double for _concatenate_mp3_bytes: just concatenates."""
    return b"".join(chunks)


# ─── ElevenLabsProvider ───────────────────────────────────────────────────────

def test_elevenlabs_synthesize():
    mock_el_client = MagicMock()
    mock_el_client.text_to_speech.convert.return_value = [FAKE_MP3]

    mock_el_mod = MagicMock()
    mock_el_mod.client.ElevenLabs.return_value = mock_el_client

    with patch.dict("sys.modules", {"elevenlabs": mock_el_mod, "elevenlabs.client": mock_el_mod.client}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=30.0):
        result = ElevenLabsProvider(api_key="el-key").synthesize("Hello world")

    assert isinstance(result, TTSResult)
    assert result.provider == "elevenlabs"
    assert result.char_count == len("Hello world")
    assert result.cost_usd > 0
    assert result.duration_seconds == 30.0


def test_elevenlabs_multi_chunk():
    """Verify multiple API calls are made for multi-paragraph text exceeding chunk limit."""
    # _chunk_text splits at paragraph boundaries (\n\n), so create several paragraphs
    # that individually fit within the limit but together exceed it
    para = "word " * 200  # ~1000 chars each
    long_text = "\n\n".join([para.strip()] * 7)  # ~7000 chars, 7 paragraphs → 2 chunks
    mock_el_client = MagicMock()
    mock_el_client.text_to_speech.convert.return_value = iter([FAKE_MP3])

    mock_el_mod = MagicMock()
    mock_el_mod.client.ElevenLabs.return_value = mock_el_client

    with patch.dict("sys.modules", {"elevenlabs": mock_el_mod, "elevenlabs.client": mock_el_mod.client}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=0.0):
        ElevenLabsProvider(api_key="k").synthesize(long_text)

    # Should have been called more than once
    assert mock_el_client.text_to_speech.convert.call_count > 1


# ─── OpenAITTSProvider ────────────────────────────────────────────────────────

def test_openai_tts_synthesize():
    mock_response = MagicMock()
    mock_response.content = FAKE_MP3

    mock_audio = MagicMock()
    mock_audio.speech.create.return_value = mock_response

    mock_client = MagicMock()
    mock_client.audio = mock_audio

    mock_openai = MagicMock()
    mock_openai.OpenAI.return_value = mock_client

    with patch.dict("sys.modules", {"openai": mock_openai}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=60.0):
        result = OpenAITTSProvider(api_key="sk-key").synthesize("Hello TTS")

    assert result.provider == "openai"
    assert result.char_count == len("Hello TTS")
    assert result.duration_seconds == 60.0
    assert result.cost_usd > 0


def test_openai_tts_cost_calculation():
    # $15 / 1M chars → 1M chars = $15
    mock_response = MagicMock()
    mock_response.content = FAKE_MP3
    mock_client = MagicMock()
    mock_client.audio.speech.create.return_value = mock_response
    mock_openai = MagicMock()
    mock_openai.OpenAI.return_value = mock_client

    text = "x" * 1_000_000
    with patch.dict("sys.modules", {"openai": mock_openai}), \
         patch("premium_tts._chunk_text", return_value=[text]), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=0.0):
        result = OpenAITTSProvider(api_key="k").synthesize(text)

    assert abs(result.cost_usd - 15.0) < 0.01


# ─── GoogleCloudTTSProvider ───────────────────────────────────────────────────

def test_google_tts_synthesize():
    import base64
    audio_b64 = base64.b64encode(FAKE_MP3).decode()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"audioContent": audio_b64}
    mock_resp.raise_for_status = MagicMock()

    mock_httpx = MagicMock()
    mock_httpx.post.return_value = mock_resp

    with patch.dict("sys.modules", {"httpx": mock_httpx, "base64": __import__("base64")}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=45.0):
        result = GoogleCloudTTSProvider(api_key="AIza").synthesize("Hello Google")

    assert result.provider == "google"
    assert result.char_count == len("Hello Google")


def test_google_tts_derives_lang_from_voice():
    """Voice name 'en-US-Neural2-D' → languageCode 'en-US'."""
    import base64
    audio_b64 = base64.b64encode(FAKE_MP3).decode()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"audioContent": audio_b64}
    mock_resp.raise_for_status = MagicMock()
    mock_httpx = MagicMock()
    mock_httpx.post.return_value = mock_resp

    with patch.dict("sys.modules", {"httpx": mock_httpx, "base64": __import__("base64")}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=0.0):
        GoogleCloudTTSProvider(api_key="k", voice="en-GB-Neural2-A").synthesize("test")

    payload = mock_httpx.post.call_args.kwargs["json"]
    assert payload["voice"]["languageCode"] == "en-GB"


# ─── AmazonPollyProvider ──────────────────────────────────────────────────────

def test_polly_parse_key_format():
    p = AmazonPollyProvider(api_key="AKID123:SECRETKEY:us-west-2")
    # _make_client should extract credentials correctly
    mock_boto3 = MagicMock()
    mock_boto3.client.return_value = MagicMock()
    with patch.dict("sys.modules", {"boto3": mock_boto3}):
        p._make_client()
    call_kwargs = mock_boto3.client.call_args.kwargs
    assert call_kwargs["aws_access_key_id"] == "AKID123"
    assert call_kwargs["aws_secret_access_key"] == "SECRETKEY"
    assert call_kwargs["region_name"] == "us-west-2"


def test_polly_default_region():
    p = AmazonPollyProvider(api_key="AKID:SECRET")  # no region
    mock_boto3 = MagicMock()
    mock_boto3.client.return_value = MagicMock()
    with patch.dict("sys.modules", {"boto3": mock_boto3}):
        p._make_client()
    call_kwargs = mock_boto3.client.call_args.kwargs
    assert call_kwargs["region_name"] == "us-east-1"


def test_polly_invalid_key_format():
    p = AmazonPollyProvider(api_key="onlyonepart")
    mock_boto3 = MagicMock()
    with patch.dict("sys.modules", {"boto3": mock_boto3}):
        with pytest.raises(ValueError, match="ACCESS_KEY_ID"):
            p._make_client()


def test_polly_synthesize():
    mock_stream = MagicMock()
    mock_stream.read.return_value = FAKE_MP3
    mock_polly_resp = {"AudioStream": mock_stream}

    mock_polly_client = MagicMock()
    mock_polly_client.synthesize_speech.return_value = mock_polly_resp

    mock_boto3 = MagicMock()
    mock_boto3.client.return_value = mock_polly_client

    with patch.dict("sys.modules", {"boto3": mock_boto3}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=20.0):
        result = AmazonPollyProvider(api_key="AKID:SECRET").synthesize("Hello Polly")

    assert result.provider == "polly"
    assert result.duration_seconds == 20.0


# ─── AzureSpeechProvider ──────────────────────────────────────────────────────

def test_azure_parse_key():
    p = AzureSpeechProvider(api_key="subkey123:eastus2")
    sub_key, region = p._parse_key()
    assert sub_key == "subkey123"
    assert region == "eastus2"


def test_azure_invalid_key_format():
    p = AzureSpeechProvider(api_key="nokeyformat")
    with pytest.raises(ValueError, match="SUBSCRIPTION_KEY"):
        p._parse_key()


def test_azure_synthesize():
    mock_resp = MagicMock()
    mock_resp.content = FAKE_MP3
    mock_resp.raise_for_status = MagicMock()

    mock_httpx = MagicMock()
    mock_httpx.post.return_value = mock_resp

    with patch.dict("sys.modules", {"httpx": mock_httpx}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=15.0):
        result = AzureSpeechProvider(api_key="key:eastus").synthesize("Hello Azure")

    assert result.provider == "azure"
    assert result.duration_seconds == 15.0


def test_azure_endpoint_uses_region():
    mock_resp = MagicMock()
    mock_resp.content = FAKE_MP3
    mock_resp.raise_for_status = MagicMock()
    mock_httpx = MagicMock()
    mock_httpx.post.return_value = mock_resp

    with patch.dict("sys.modules", {"httpx": mock_httpx}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=0.0):
        AzureSpeechProvider(api_key="k:westeurope").synthesize("test")

    url = mock_httpx.post.call_args.args[0]
    assert "westeurope" in url


def test_azure_escapes_xml_chars():
    """Text with XML special chars (<, >, &) must be escaped in SSML."""
    mock_resp = MagicMock()
    mock_resp.content = FAKE_MP3
    mock_resp.raise_for_status = MagicMock()
    mock_httpx = MagicMock()
    mock_httpx.post.return_value = mock_resp

    text_with_xml = "Hello <World> & 'Friends'"
    with patch.dict("sys.modules", {"httpx": mock_httpx}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=0.0):
        AzureSpeechProvider(api_key="k:eastus").synthesize(text_with_xml)

    ssml_bytes = mock_httpx.post.call_args.kwargs["content"]
    ssml = ssml_bytes.decode("utf-8")
    assert "<World>" not in ssml   # must be escaped
    assert "&amp;" in ssml or "&lt;" in ssml or "&gt;" in ssml


# ─── FreeTTSProvider ─────────────────────────────────────────────────────────

def test_free_tts_provider_has_zero_cost():
    """FreeTTSProvider always reports cost_usd = 0."""
    # Mock the tex_to_audio module that FreeTTSProvider imports at runtime
    import tempfile, os

    mock_tex_to_audio = MagicMock()
    mock_tex_to_audio._split_into_chunks.return_value = ["chunk one", "chunk two"]

    fake_mp3_path = None

    def fake_tts_chunk(chunk, path, voice):
        with open(path, "wb") as f:
            f.write(FAKE_MP3)

    mock_tex_to_audio._tts_chunk.side_effect = fake_tts_chunk

    with patch.dict("sys.modules", {"tex_to_audio": mock_tex_to_audio}), \
         patch("premium_tts._concatenate_mp3_bytes", side_effect=_mock_concatenate), \
         patch("premium_tts._mp3_duration", return_value=5.0):
        result = FreeTTSProvider().synthesize("test text")

    assert result.cost_usd == 0.0
    assert result.provider == "free"
