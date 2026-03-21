-- Migration 004: Premium Narration
--
-- Adds narration_versions table for tracking multiple quality tiers per paper,
-- adds best_version_id and script_char_count to papers, and migrates existing
-- narrated papers into narration_versions as free-tier entries.
--
-- Run on prod:
--   npx wrangler d1 execute unarxiv-db --remote --file=migrations/004_premium_narration.sql

-- 1. Create narration_versions table
CREATE TABLE IF NOT EXISTS narration_versions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id          TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    version_type      TEXT NOT NULL CHECK(version_type IN ('free', 'premium')),
    quality_rank      INTEGER NOT NULL DEFAULT 0,
    script_type       TEXT NOT NULL CHECK(script_type IN ('free', 'premium')),
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

CREATE INDEX IF NOT EXISTS idx_nv_paper ON narration_versions(paper_id);
CREATE INDEX IF NOT EXISTS idx_nv_quality ON narration_versions(paper_id, quality_rank DESC);

-- 2. Add new columns to papers table
ALTER TABLE papers ADD COLUMN best_version_id INTEGER;
ALTER TABLE papers ADD COLUMN script_char_count INTEGER;

-- 3. Migrate existing narrated papers into narration_versions as free-tier entries
INSERT INTO narration_versions (paper_id, version_type, quality_rank, script_type, tts_provider, tts_model, audio_r2_key, duration_seconds, created_at)
SELECT
    id,
    'free',
    0,
    'free',
    'openai',
    'tts-1',
    audio_r2_key,
    duration_seconds,
    COALESCE(completed_at, created_at)
FROM papers
WHERE status = 'narrated' AND audio_r2_key IS NOT NULL;

-- 4. Set best_version_id on papers that now have versions
UPDATE papers
SET best_version_id = (
    SELECT id FROM narration_versions
    WHERE paper_id = papers.id
    ORDER BY quality_rank DESC
    LIMIT 1
)
WHERE status = 'narrated' AND audio_r2_key IS NOT NULL;
