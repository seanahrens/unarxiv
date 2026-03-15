-- TexReader Web — D1 Schema
-- Run: wrangler d1 execute texreader-db --file=schema.sql

-- Core paper data + job state
CREATE TABLE IF NOT EXISTS papers (
    id              TEXT PRIMARY KEY,          -- arXiv ID, e.g. "2302.00672v1"
    arxiv_url       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    authors         TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
    abstract        TEXT NOT NULL DEFAULT '',
    published_date  TEXT DEFAULT '',

    -- Job state
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK(status IN ('queued','preparing',
                                     'generating_audio',
                                     'complete','failed')),
    error_message   TEXT,
    progress_detail TEXT,                       -- e.g. "chunk 14/37"

    -- Audio metadata (populated on completion)
    audio_r2_key    TEXT,                       -- R2 object key
    audio_size_bytes INTEGER,
    duration_seconds INTEGER,

    -- Denormalized rating aggregates (updated on each rating)
    rating_count    INTEGER NOT NULL DEFAULT 0,
    rating_sum      INTEGER NOT NULL DEFAULT 0,
    bayesian_avg    REAL,                           -- Bayesian average: (C*m + sum) / (C + n)
    has_low_rating  INTEGER NOT NULL DEFAULT 0,     -- 1 if any rating < 3 stars

    -- Submitter info
    submitted_by_ip      TEXT,
    submitted_by_country TEXT,
    submitted_by_city    TEXT,

    -- Timestamps
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at);

-- Full-text search (D1 supports fts5)
CREATE VIRTUAL TABLE IF NOT EXISTS papers_fts USING fts5(
    id,
    title,
    authors,
    abstract,
    content=papers,
    content_rowid=rowid
);

-- Triggers to keep FTS in sync
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

-- Page visits for popularity ranking (unique per IP per paper)
CREATE TABLE IF NOT EXISTS page_visits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id    TEXT NOT NULL,
    visitor_ip  TEXT NOT NULL DEFAULT '',
    visited_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_unique ON page_visits(paper_id, visitor_ip);
CREATE INDEX IF NOT EXISTS idx_visits_paper_date ON page_visits(paper_id, visited_at);

-- Narration quality ratings (one per IP per paper)
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

-- Rate limit tracking for submissions
CREATE TABLE IF NOT EXISTS submissions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address   TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_ip_date ON submissions(ip_address, submitted_at);
