-- Migration 006: Vocabulary rename
--
-- Renames version_type/script_type values: "free" → "base", "premium" → "upgraded"
-- Renames voice_tier values: "free" → "plus1", "openai" → "plus2", "elevenlabs" → "plus3"
--
-- SQLite CHECK constraints can't be altered, so narration_versions must be recreated.

-- 1. Update ratings voice_tier column values
UPDATE ratings SET voice_tier = 'plus1' WHERE voice_tier = 'free';
UPDATE ratings SET voice_tier = 'plus2' WHERE voice_tier = 'openai';
UPDATE ratings SET voice_tier = 'plus3' WHERE voice_tier = 'elevenlabs';

-- 2. Recreate narration_versions with updated CHECK constraints
CREATE TABLE narration_versions_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id          TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    version_type      TEXT NOT NULL CHECK(version_type IN ('base', 'upgraded')),
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

-- Copy data with renamed values
INSERT INTO narration_versions_new
    (id, paper_id, version_type, quality_rank, script_type,
     tts_provider, tts_model, llm_provider, llm_model,
     audio_r2_key, transcript_r2_key, duration_seconds,
     actual_cost, llm_cost, tts_cost, created_at)
SELECT
    id, paper_id,
    CASE version_type WHEN 'free' THEN 'base' WHEN 'premium' THEN 'upgraded' ELSE version_type END,
    quality_rank,
    CASE script_type WHEN 'free' THEN 'base' WHEN 'premium' THEN 'upgraded' ELSE script_type END,
    tts_provider, tts_model, llm_provider, llm_model,
    audio_r2_key, transcript_r2_key, duration_seconds,
    actual_cost, llm_cost, tts_cost, created_at
FROM narration_versions;

DROP TABLE narration_versions;
ALTER TABLE narration_versions_new RENAME TO narration_versions;

-- Recreate indexes
CREATE INDEX idx_nv_paper ON narration_versions(paper_id);
CREATE INDEX idx_nv_quality ON narration_versions(paper_id, quality_rank DESC);
