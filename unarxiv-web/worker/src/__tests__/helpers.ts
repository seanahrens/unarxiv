/**
 * Test helpers: schema init and fixture insertion.
 * Uses env.DB.exec() — D1's multi-statement SQL executor, NOT shell exec.
 */
import { env } from "cloudflare:test";

const TEST_SCHEMA = `
CREATE TABLE IF NOT EXISTS papers (
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
  best_version_id  INTEGER,
  script_char_count INTEGER,
  tar_bytes         INTEGER,
  latex_char_count  INTEGER,
  figure_count      INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS narration_versions (
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
  actual_input_tokens  INTEGER,
  actual_output_tokens INTEGER,
  provider_model       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS model_coefficients (
  provider_model         TEXT PRIMARY KEY,
  input_token_coeffs     TEXT NOT NULL,
  input_token_intercept  REAL NOT NULL,
  output_token_coeffs    TEXT NOT NULL,
  output_token_intercept REAL NOT NULL,
  input_rmse             REAL NOT NULL,
  output_rmse            REAL NOT NULL,
  proxy_input_rmse       REAL NOT NULL,
  proxy_output_rmse      REAL NOT NULL,
  sample_count           INTEGER NOT NULL,
  trained_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address   TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS page_visits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id        TEXT NOT NULL,
  visitor_ip      TEXT NOT NULL DEFAULT '',
  visitor_token   TEXT,
  visited_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_unique ON page_visits(paper_id, visitor_ip);
CREATE TABLE IF NOT EXISTS ratings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id    TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  rater_ip    TEXT NOT NULL,
  rater_token TEXT,
  stars       INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '',
  voice_tier  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lists (
  id           TEXT PRIMARY KEY,
  owner_token  TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  creator_ip   TEXT,
  publicly_listed INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS list_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id   TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  paper_id  TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0,
  added_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_playlist (
  user_token  TEXT NOT NULL,
  paper_id    TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_token, paper_id)
);
CREATE TABLE IF NOT EXISTS user_listen_history (
  user_token  TEXT NOT NULL,
  paper_id    TEXT NOT NULL,
  read_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_token, paper_id)
);
CREATE TABLE IF NOT EXISTS playback_positions (
  user_token  TEXT NOT NULL,
  paper_id    TEXT NOT NULL,
  position    REAL NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_token, paper_id)
);
`;

export async function initDb(): Promise<void> {
  // D1 in the Workers runtime: use prepare().run() for each DDL statement.
  // We split on ";\n" to avoid splitting inside DEFAULT (datetime('now')) etc.
  const statements = TEST_SCHEMA
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
  for (const stmt of statements) {
    const normalized = stmt.endsWith(";") ? stmt : stmt + ";";
    await env.DB.prepare(normalized).run();
  }
}

export interface PaperFixture {
  id: string;
  title?: string;
  authors?: string[];
  abstract?: string;
  status?: "unnarrated" | "narrating" | "narrated" | "failed";
  script_char_count?: number | null;
}

export async function insertPaper(fixture: PaperFixture): Promise<void> {
  const {
    id,
    title = "Test Paper Title",
    authors = ["Author One", "Author Two"],
    abstract = "This is a test abstract for the paper.",
    status = "unnarrated",
    script_char_count = null,
  } = fixture;
  await env.DB.prepare(
    `INSERT INTO papers (id, arxiv_url, title, authors, abstract, published_date, status, script_char_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      `https://arxiv.org/abs/${id}`,
      title,
      JSON.stringify(authors),
      abstract,
      "2024-01-01",
      status,
      script_char_count
    )
    .run();
}
