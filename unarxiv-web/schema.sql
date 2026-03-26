-- unarXiv — D1 Schema
-- Run: wrangler d1 execute unarxiv-db --file=schema.sql

-- Core paper data + job state
CREATE TABLE IF NOT EXISTS papers (
    id              TEXT PRIMARY KEY,          -- arXiv ID without version suffix, e.g. "2302.00672"
    arxiv_url       TEXT NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    authors         TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
    abstract        TEXT NOT NULL DEFAULT '',
    published_date  TEXT DEFAULT '',

    -- Job state
    status          TEXT NOT NULL DEFAULT 'unnarrated'
                    CHECK(status IN ('unnarrated','narrating','narrated','failed')),
    error_message   TEXT,
    error_category  TEXT,                        -- structured error type (e.g. 'llm', 'tts', 'rate_limit')
    retry_count     INTEGER NOT NULL DEFAULT 0,  -- number of narration attempts
    progress_detail TEXT,                       -- admin reprocess status messages
    eta_seconds     INTEGER,                    -- estimated seconds remaining (set by Modal)

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
    submitted_by_token   TEXT,                    -- client-generated user identity token
    submitted_by_country TEXT,
    submitted_by_city    TEXT,

    -- Premium narration tracking
    best_version_id  INTEGER,              -- FK to narration_versions (set after migration 004)
    script_char_count INTEGER,             -- cached char count for cost estimation

    -- Source stats for cost estimation (populated during narration, migration 009)
    tar_bytes         INTEGER,             -- compressed source archive size
    latex_char_count  INTEGER,             -- total chars across all .tex files
    figure_count      INTEGER,             -- number of image files in source

    -- Timestamps
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at);
CREATE INDEX IF NOT EXISTS idx_papers_submitted_by_token ON papers(submitted_by_token);

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

-- Page visits for popularity ranking (unique per token or IP per paper)
CREATE TABLE IF NOT EXISTS page_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id        TEXT NOT NULL,
    visitor_ip      TEXT NOT NULL DEFAULT '',
    visitor_token   TEXT,                          -- client-generated user identity token
    visited_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_unique ON page_visits(paper_id, visitor_ip);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_unique_token ON page_visits(paper_id, visitor_token) WHERE visitor_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_paper_date ON page_visits(paper_id, visited_at);

-- Narration quality ratings (one per token or IP per paper)
CREATE TABLE IF NOT EXISTS ratings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id    TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    rater_ip    TEXT NOT NULL,
    rater_token TEXT,                              -- client-generated user identity token
    stars       INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
    comment     TEXT NOT NULL DEFAULT '',
    voice_tier  TEXT,                              -- 'plus3' | 'plus2' | 'plus1' | 'base' | null
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_unique ON ratings(paper_id, rater_ip);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_unique_token ON ratings(paper_id, rater_token) WHERE rater_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_paper ON ratings(paper_id);
CREATE INDEX IF NOT EXISTS idx_ratings_low ON ratings(paper_id) WHERE stars <= 3;

-- Rate limit tracking for submissions
CREATE TABLE IF NOT EXISTS submissions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address   TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_ip_date ON submissions(ip_address, submitted_at);

-- User-curated lists of papers
CREATE TABLE IF NOT EXISTS lists (
    id           TEXT PRIMARY KEY,              -- 6-char alphanumeric
    owner_token  TEXT NOT NULL,                 -- 32-char hex secret for ownership
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    creator_ip   TEXT,                          -- abuse tracking only
    publicly_listed INTEGER NOT NULL DEFAULT 1, -- 1 = visible in public directory
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lists_owner_token ON lists(owner_token);

CREATE TABLE IF NOT EXISTS list_items (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id   TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    paper_id  TEXT NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0,
    added_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items_unique ON list_items(list_id, paper_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id, position);

-- User playlist (synced across devices)
CREATE TABLE IF NOT EXISTS user_playlist (
    user_token  TEXT NOT NULL,
    paper_id    TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    added_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_token, paper_id)
);

-- User listen history (synced across devices)
CREATE TABLE IF NOT EXISTS user_listen_history (
    user_token  TEXT NOT NULL,
    paper_id    TEXT NOT NULL,
    read_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_token, paper_id)
);

-- Playback positions (synced across devices)
CREATE TABLE IF NOT EXISTS playback_positions (
    user_token  TEXT NOT NULL,
    paper_id    TEXT NOT NULL,
    position    REAL NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_token, paper_id)
);

-- Narration versions: multiple quality tiers per paper
-- best_version_id and script_char_count are added to papers via migration 004
CREATE TABLE IF NOT EXISTS narration_versions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id          TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    narration_tier    TEXT NOT NULL CHECK(narration_tier IN ('base', 'plus1', 'plus2', 'plus3')),
    quality_rank      INTEGER NOT NULL DEFAULT 0,  -- higher = better quality
    tts_provider      TEXT,     -- 'openai' | 'elevenlabs' | 'google' | null (free voice)
    tts_model         TEXT,     -- provider-specific model ID
    llm_provider      TEXT,     -- 'openai' | 'anthropic' | null (base script)
    llm_model         TEXT,     -- provider-specific model ID
    audio_r2_key      TEXT,     -- R2 key for this version's audio
    transcript_r2_key TEXT,     -- R2 key for this version's transcript
    duration_seconds  INTEGER,
    actual_cost       REAL,     -- total USD spent (llm_cost + tts_cost)
    llm_cost          REAL,
    tts_cost          REAL,
    -- LLM token tracking for cost model training (migration 009)
    actual_input_tokens  INTEGER,  -- actual LLM input tokens consumed
    actual_output_tokens INTEGER,  -- actual LLM output tokens consumed
    provider_model       TEXT,     -- e.g. "anthropic:claude-sonnet-4-6"
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nv_paper ON narration_versions(paper_id);
CREATE INDEX IF NOT EXISTS idx_nv_quality ON narration_versions(paper_id, quality_rank DESC);

-- Per-script quality scores from automated eval agent (migration 010)
-- Each row is one evaluation run of one narration_version.
-- scored_by: 'eval-agent' | 'human'
-- Scores are 0.0–1.0 per goal; score_overall is a weighted composite.
CREATE TABLE IF NOT EXISTS narration_scores (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id       INTEGER NOT NULL REFERENCES narration_versions(id) ON DELETE CASCADE,
    scored_by        TEXT NOT NULL DEFAULT 'eval-agent',
    score_fidelity   REAL,   -- Goal 1: near-verbatim fidelity
    score_citations  REAL,   -- Goal 2: citation/footnote stripping
    score_header     REAL,   -- Goal 3: header/footer compliance
    score_figures    REAL,   -- Goal 4: figure/table description quality
    score_tts        REAL,   -- Goal 5: TTS formatting quality
    score_overall    REAL,   -- weighted composite (0.0–1.0)
    notes            TEXT,   -- eval agent findings / specific issues
    parser_commit    TEXT,   -- short git commit hash of parser code that produced the script
    scored_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scores_version ON narration_scores(version_id);
CREATE INDEX IF NOT EXISTS idx_scores_scored_at ON narration_scores(scored_at);

-- Parser version registry (migration 011)
-- Eval agents register each commit hash when they run, even if no papers are scored yet.
-- This lets the Quality Insights chart show the latest commit on the x-axis as an empty period.
CREATE TABLE IF NOT EXISTS parser_versions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_hash   TEXT NOT NULL,
    tier          TEXT NOT NULL,  -- 'base' | 'plus1' | 'plus2' | 'plus3'
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    notes         TEXT,
    UNIQUE(commit_hash, tier)
);
CREATE INDEX IF NOT EXISTS idx_parser_versions_tier ON parser_versions(tier, registered_at);

-- ML cost model coefficients (migration 009)
-- Trained by evals/cost_model/train.py and deployed via POST /api/admin/model-coefficients
CREATE TABLE IF NOT EXISTS model_coefficients (
    provider_model         TEXT PRIMARY KEY,  -- e.g. "anthropic:claude-sonnet-4-6"
    input_token_coeffs     TEXT NOT NULL,     -- JSON array: [latex_chars, figures, tar_bytes, script_chars]
    input_token_intercept  REAL NOT NULL,
    output_token_coeffs    TEXT NOT NULL,     -- JSON array: same feature order
    output_token_intercept REAL NOT NULL,
    input_rmse             REAL NOT NULL,     -- ML RMSE on test set (input tokens)
    output_rmse            REAL NOT NULL,     -- ML RMSE on test set (output tokens)
    proxy_input_rmse       REAL NOT NULL,     -- proxy formula RMSE (for comparison)
    proxy_output_rmse      REAL NOT NULL,
    sample_count           INTEGER NOT NULL,  -- number of training samples
    trained_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
