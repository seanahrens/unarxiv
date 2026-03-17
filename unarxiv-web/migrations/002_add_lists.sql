-- Lists feature: user-curated collections of papers
-- Run: wrangler d1 execute unarxiv-db --remote --file=migrations/002_add_lists.sql

CREATE TABLE IF NOT EXISTS lists (
    id           TEXT PRIMARY KEY,              -- 4-char alphanumeric
    owner_token  TEXT NOT NULL,                 -- 32-char hex secret for ownership
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    creator_ip   TEXT,                          -- abuse tracking only
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
