-- Migration: Add ratings system
-- Run: npx wrangler d1 execute texreader-db --remote --file=migrations/001_add_ratings.sql

-- Add denormalized rating columns to papers table
ALTER TABLE papers ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE papers ADD COLUMN rating_sum INTEGER NOT NULL DEFAULT 0;
ALTER TABLE papers ADD COLUMN bayesian_avg REAL;
ALTER TABLE papers ADD COLUMN has_low_rating INTEGER NOT NULL DEFAULT 0;

-- Create ratings table
CREATE TABLE IF NOT EXISTS ratings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id    TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    rater_ip    TEXT NOT NULL,
    stars       INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    comment     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_unique ON ratings(paper_id, rater_ip);
CREATE INDEX IF NOT EXISTS idx_ratings_paper ON ratings(paper_id);
CREATE INDEX IF NOT EXISTS idx_ratings_low ON ratings(paper_id) WHERE stars <= 3;

-- Index for curate page sort order
CREATE INDEX IF NOT EXISTS idx_papers_bayesian ON papers(bayesian_avg);
