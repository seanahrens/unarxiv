"""
r2paths.py — Centralized R2 storage key conventions for the Modal worker.

Mirrors unarxiv-web/worker/src/handlers/r2paths.ts.

All narrations (base and premium) now use versioned keys.
Legacy flat keys are kept for backward-compatible reads of pre-versioning objects.
"""


def versioned_audio_key(arxiv_id: str, version_id: str) -> str:
    """R2 key for a versioned audio file (base or premium)."""
    return f"audio/{arxiv_id}/v{version_id}.mp3"


def versioned_transcript_key(arxiv_id: str, version_id: str) -> str:
    """R2 key for a versioned transcript file (base or premium)."""
    return f"transcripts/{arxiv_id}/v{version_id}.txt"


def legacy_base_audio_key(arxiv_id: str) -> str:
    """Legacy flat audio key — backward-compat reads of pre-versioning narrations only."""
    return f"audio/{arxiv_id}.mp3"


def legacy_base_transcript_key(arxiv_id: str) -> str:
    """Legacy flat transcript key — backward-compat reads of pre-versioning narrations only."""
    return f"transcripts/{arxiv_id}.txt"
