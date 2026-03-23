-- Migration 008: Drop script_type column from narration_versions
--
-- script_type ("base"/"upgraded") is fully derivable from narration_tier:
--   narration_tier = 'base'  → script was never LLM-processed
--   narration_tier = 'plus1' | 'plus2' | 'plus3' → script was LLM-processed
--
-- The column was also buggy: Modal never sent script_type in its webhook,
-- so the worker's `body.script_type ?? "base"` fallback stamped all narrations
-- as 'base' regardless of whether an LLM processed them.
--
-- findExistingPremiumScript() now queries `narration_tier != 'base'` instead.

CREATE TABLE narration_versions_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id          TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    narration_tier    TEXT NOT NULL CHECK(narration_tier IN ('base', 'plus1', 'plus2', 'plus3')),
    quality_rank      INTEGER NOT NULL DEFAULT 0,
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

INSERT INTO narration_versions_new
    (id, paper_id, narration_tier, quality_rank,
     tts_provider, tts_model, llm_provider, llm_model,
     audio_r2_key, transcript_r2_key, duration_seconds,
     actual_cost, llm_cost, tts_cost, created_at)
SELECT
    id, paper_id, narration_tier, quality_rank,
    tts_provider, tts_model, llm_provider, llm_model,
    audio_r2_key, transcript_r2_key, duration_seconds,
    actual_cost, llm_cost, tts_cost, created_at
FROM narration_versions;

DROP TABLE narration_versions;
ALTER TABLE narration_versions_new RENAME TO narration_versions;

CREATE INDEX idx_nv_paper ON narration_versions(paper_id);
CREATE INDEX idx_nv_quality ON narration_versions(paper_id, quality_rank DESC);
