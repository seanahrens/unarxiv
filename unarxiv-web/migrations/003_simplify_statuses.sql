-- Migration 003: Simplify paper statuses + add updated_at + eta_seconds
--
-- Old statuses: not_requested, queued, preparing, generating_audio, complete, failed
-- New statuses: unnarrated, narrating, narrated, failed
--
-- Run on prod:
--   npx wrangler d1 execute unarxiv-db --remote --file=migrations/003_simplify_statuses.sql

-- 1. Create new table with updated schema
CREATE TABLE papers_new (
    id              TEXT PRIMARY KEY,
    arxiv_url       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    authors         TEXT NOT NULL DEFAULT '[]',
    abstract        TEXT NOT NULL DEFAULT '',
    published_date  TEXT DEFAULT '',

    status          TEXT NOT NULL DEFAULT 'unnarrated'
                    CHECK(status IN ('unnarrated','narrating','narrated','failed')),
    error_message   TEXT,
    progress_detail TEXT,
    eta_seconds     INTEGER,

    audio_r2_key    TEXT,
    audio_size_bytes INTEGER,
    duration_seconds INTEGER,

    rating_count    INTEGER NOT NULL DEFAULT 0,
    rating_sum      INTEGER NOT NULL DEFAULT 0,
    bayesian_avg    REAL,
    has_low_rating  INTEGER NOT NULL DEFAULT 0,

    submitted_by_ip      TEXT,
    submitted_by_token   TEXT,
    submitted_by_country TEXT,
    submitted_by_city    TEXT,

    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Copy data with status mapping
INSERT INTO papers_new
SELECT
    id, arxiv_url, title, authors, abstract, published_date,
    CASE status
        WHEN 'not_requested' THEN 'unnarrated'
        WHEN 'queued' THEN 'narrating'
        WHEN 'preparing' THEN 'narrating'
        WHEN 'generating_audio' THEN 'narrating'
        WHEN 'complete' THEN 'narrated'
        WHEN 'failed' THEN 'failed'
    END,
    error_message, progress_detail, NULL,
    audio_r2_key, audio_size_bytes, duration_seconds,
    rating_count, rating_sum, bayesian_avg, has_low_rating,
    submitted_by_ip, submitted_by_token, submitted_by_country, submitted_by_city,
    created_at, completed_at, datetime('now')
FROM papers;

-- 3. Drop FTS triggers (they reference old table)
DROP TRIGGER IF EXISTS papers_ai;
DROP TRIGGER IF EXISTS papers_ad;
DROP TRIGGER IF EXISTS papers_au;

-- 4. Drop old table
DROP TABLE papers;

-- 5. Rename new table
ALTER TABLE papers_new RENAME TO papers;

-- 6. Recreate indexes
CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at);
CREATE INDEX IF NOT EXISTS idx_papers_submitted_by_token ON papers(submitted_by_token);

-- 7. Recreate FTS triggers
CREATE TRIGGER IF NOT EXISTS papers_ai AFTER INSERT ON papers BEGIN
    INSERT INTO papers_fts(rowid, id, title, authors, abstract)
    VALUES (new.rowid, new.id, new.title, new.authors, new.abstract);
END;

CREATE TRIGGER IF NOT EXISTS papers_ad AFTER DELETE ON papers BEGIN
    INSERT INTO papers_fts(papers_fts, rowid, id, title, authors, abstract)
    VALUES ('delete', old.rowid, old.id, old.title, old.authors, old.abstract);
END;

CREATE TRIGGER IF NOT EXISTS papers_au AFTER UPDATE ON papers BEGIN
    INSERT INTO papers_fts(papers_fts, rowid, id, title, authors, abstract)
    VALUES ('delete', old.rowid, old.id, old.title, old.authors, old.abstract);
    INSERT INTO papers_fts(rowid, id, title, authors, abstract)
    VALUES (new.rowid, new.id, new.title, new.authors, new.abstract);
END;
