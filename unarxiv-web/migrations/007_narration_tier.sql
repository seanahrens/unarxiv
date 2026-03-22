-- Migration 007: Replace version_type with narration_tier
--
-- Merges version_type ("base"/"upgraded") and the tts_provider-to-tier mapping
-- into a single narration_tier column: "base" | "plus1" | "plus2" | "plus3".
--
-- The tier is now stored directly at write time instead of being derived at read time.
-- version_type is dropped — narration_tier encodes both "is this upgraded?" and "which tier?"

CREATE TABLE narration_versions_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id          TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    narration_tier    TEXT NOT NULL CHECK(narration_tier IN ('base', 'plus1', 'plus2', 'plus3')),
    quality_rank      INTEGER NOT NULL DEFAULT 0,
    script_type       TEXT NOT NULL CHECK(script_type IN ('base', 'upgraded')),
    tts_provider      TEXT,
    tts_model         TEXT,
    llm_provider      TEXT,
    llm_model         TEXT,
    audio_r2_key      TEXT,
    transcript_r2_key TEXT,
    duration_seconds  INTEGER,
    actual_cost       REAL,
    llm_cost          REAL,
    tts_cost          REAL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Populate narration_tier from version_type + tts_provider:
--   base version_type → 'base'
--   upgraded + elevenlabs → 'plus3'
--   upgraded + openai → 'plus2'
--   upgraded + anything else (including null/free) → 'plus1'
INSERT INTO narration_versions_new
    (id, paper_id, narration_tier, quality_rank, script_type,
     tts_provider, tts_model, llm_provider, llm_model,
     audio_r2_key, transcript_r2_key, duration_seconds,
     actual_cost, llm_cost, tts_cost, created_at)
SELECT
    id, paper_id,
    CASE
        WHEN version_type = 'base' THEN 'base'
        WHEN tts_provider = 'elevenlabs' THEN 'plus3'
        WHEN tts_provider = 'openai' THEN 'plus2'
        ELSE 'plus1'
    END,
    quality_rank, script_type,
    tts_provider, tts_model, llm_provider, llm_model,
    audio_r2_key, transcript_r2_key, duration_seconds,
    actual_cost, llm_cost, tts_cost, created_at
FROM narration_versions;

DROP TABLE narration_versions;
ALTER TABLE narration_versions_new RENAME TO narration_versions;

CREATE INDEX idx_nv_paper ON narration_versions(paper_id);
CREATE INDEX idx_nv_quality ON narration_versions(paper_id, quality_rank DESC);
