/**
 * Database queries for D1.
 */
import type { Paper, PaperStatus, List, ListItem, NarrationVersion } from "./types";
import { parseSearchQuery, toFtsQuery } from "./search";

/** Get a paper by arXiv ID. */
export async function getPaper(db: D1Database, id: string): Promise<Paper | null> {
  return db
    .prepare("SELECT * FROM papers WHERE id = ?")
    .bind(id)
    .first<Paper>();
}

/** Get multiple papers by arXiv IDs. */
export async function getPapersBatch(db: D1Database, ids: string[]): Promise<Paper[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const result = await db
    .prepare(`SELECT * FROM papers WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<Paper>();
  return result.results;
}

/** Insert a new paper. Returns true if inserted, false if already exists. */
export async function insertPaper(
  db: D1Database,
  paper: {
    id: string;
    arxiv_url: string;
    title: string;
    authors: string[];
    abstract: string;
    published_date: string;
    submitted_by_ip?: string;
    submitted_by_token?: string;
    submitted_by_country?: string;
    submitted_by_city?: string;
  }
): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO papers (id, arxiv_url, title, authors, abstract, published_date, status,
         submitted_by_ip, submitted_by_token, submitted_by_country, submitted_by_city)
         VALUES (?, ?, ?, ?, ?, ?, 'unnarrated', ?, ?, ?, ?)`
      )
      .bind(
        paper.id,
        paper.arxiv_url,
        paper.title,
        JSON.stringify(paper.authors),
        paper.abstract,
        paper.published_date,
        paper.submitted_by_ip || null,
        paper.submitted_by_token || null,
        paper.submitted_by_country || null,
        paper.submitted_by_city || null
      )
      .run();
    return true;
  } catch (e: any) {
    // UNIQUE constraint = already exists
    if (e.message?.includes("UNIQUE")) return false;
    throw e;
  }
}

/** Update paper status and optional details. */
export async function updatePaperStatus(
  db: D1Database,
  id: string,
  status: PaperStatus,
  details?: {
    progress_detail?: string;
    error_message?: string;
    eta_seconds?: number | null;
    audio_r2_key?: string;
    audio_size_bytes?: number;
    duration_seconds?: number;
  }
): Promise<void> {
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const values: (string | number | null)[] = [status];

  if (details?.progress_detail !== undefined) {
    sets.push("progress_detail = ?");
    values.push(details.progress_detail);
  }
  if (details?.error_message !== undefined) {
    sets.push("error_message = ?");
    values.push(details.error_message);
  }
  if (details?.eta_seconds !== undefined) {
    sets.push("eta_seconds = ?");
    values.push(details.eta_seconds);
  }
  if (details?.audio_r2_key !== undefined) {
    sets.push("audio_r2_key = ?");
    values.push(details.audio_r2_key);
  }
  if (details?.audio_size_bytes !== undefined) {
    sets.push("audio_size_bytes = ?");
    values.push(details.audio_size_bytes);
  }
  if (details?.duration_seconds !== undefined) {
    sets.push("duration_seconds = ?");
    values.push(details.duration_seconds);
  }
  if (status === "narrated") {
    sets.push("completed_at = datetime('now')");
    sets.push("eta_seconds = 0");
  }

  values.push(id);
  await db
    .prepare(`UPDATE papers SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

/** Search papers using FTS5. */
export async function searchPapers(
  db: D1Database,
  query: string,
  limit: number = 20,
  offset: number = 0
): Promise<Paper[]> {
  const sanitized = toFtsQuery(parseSearchQuery(query));

  if (!sanitized) return [];

  const results = await db
    .prepare(
      `SELECT p.* FROM papers p
       JOIN papers_fts f ON p.rowid = f.rowid
       WHERE papers_fts MATCH ?
       ORDER BY rank
       LIMIT ? OFFSET ?`
    )
    .bind(sanitized, limit, offset)
    .all<Paper>();

  return results.results;
}

/** Get popular papers (by visit count in last 7 days). */
export async function getPopularPapers(
  db: D1Database,
  limit: number = 20,
  offset: number = 0
): Promise<(Paper & { visit_count: number })[]> {
  const results = await db
    .prepare(
      `SELECT p.*, COALESCE(v.visit_count, 0) as visit_count
       FROM papers p
       LEFT JOIN (
         SELECT paper_id, COUNT(*) as visit_count
         FROM page_visits
         WHERE visited_at > datetime('now', '-7 days')
         GROUP BY paper_id
       ) v ON v.paper_id = p.id
       ORDER BY visit_count DESC, p.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<Paper & { visit_count: number }>();

  return results.results;
}

/** Get recent papers (including in-progress). */
export async function getRecentPapers(
  db: D1Database,
  limit: number = 20,
  offset: number = 0,
  status?: string
): Promise<Paper[]> {
  const sql = status
    ? `SELECT * FROM papers WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM papers ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const bindings = status ? [status, limit, offset] : [limit, offset];
  const results = await db
    .prepare(sql)
    .bind(...bindings)
    .all<Paper>();

  return results.results;
}

/** Record a unique page visit (one per token or IP per paper). */
export async function recordVisit(db: D1Database, paperId: string, ip: string, token?: string | null): Promise<void> {
  if (token) {
    await db
      .prepare("INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip, visitor_token) VALUES (?, ?, ?)")
      .bind(paperId, ip, token)
      .run();
  } else {
    await db
      .prepare("INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip) VALUES (?, ?)")
      .bind(paperId, ip)
      .run();
  }
}

/** Check IP rate limit. Returns number of submissions today. */
export async function getSubmissionCount(
  db: D1Database,
  ip: string
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count FROM submissions
       WHERE ip_address = ? AND submitted_at > datetime('now', '-1 day')`
    )
    .bind(ip)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

/** Get global submission count for today. */
export async function getGlobalSubmissionCount(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count FROM submissions
       WHERE submitted_at > datetime('now', '-1 day')`
    )
    .first<{ count: number }>();

  return result?.count ?? 0;
}

/** Record a submission for rate limiting. */
export async function recordSubmission(db: D1Database, ip: string): Promise<void> {
  await db
    .prepare("INSERT INTO submissions (ip_address) VALUES (?)")
    .bind(ip)
    .run();
}

/** Get papers submitted by a specific IP. */
export async function getPapersBySubmitterIp(db: D1Database, ip: string): Promise<Paper[]> {
  const results = await db
    .prepare("SELECT * FROM papers WHERE submitted_by_ip = ? ORDER BY created_at DESC")
    .bind(ip)
    .all<Paper>();
  return results.results;
}

/** Get papers submitted by a specific user token. */
export async function getPapersBySubmitterToken(db: D1Database, token: string): Promise<Paper[]> {
  const results = await db
    .prepare("SELECT * FROM papers WHERE submitted_by_token = ? ORDER BY created_at DESC")
    .bind(token)
    .all<Paper>();
  return results.results;
}

/** Get all papers (for admin). */
export async function getAllPapers(
  db: D1Database,
  limit: number = 100,
  offset: number = 0
): Promise<Paper[]> {
  const results = await db
    .prepare(
      `SELECT * FROM papers
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<Paper>();

  return results.results;
}

/** Reset a paper for reprocessing: update metadata and set status to narrating. */
export async function resetPaperForReprocess(
  db: D1Database,
  id: string,
  meta: {
    title: string;
    authors: string[];
    abstract: string;
    published_date: string;
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE papers SET title = ?, authors = ?, abstract = ?, published_date = ?,
       status = 'narrating', eta_seconds = NULL, progress_detail = NULL, error_message = NULL,
       audio_r2_key = NULL, audio_size_bytes = NULL, duration_seconds = NULL, completed_at = NULL,
       updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(meta.title, JSON.stringify(meta.authors), meta.abstract, meta.published_date, id)
    .run();
}

/** Delete a paper by ID. */
export async function deletePaper(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM ratings WHERE paper_id = ?").bind(id),
    db.prepare("DELETE FROM papers WHERE id = ?").bind(id),
    db.prepare("DELETE FROM page_visits WHERE paper_id = ?").bind(id),
  ]);
}

/** Get top contributors by token or IP (for admin). */
export async function getTopContributors(
  db: D1Database,
  limit: number = 10
): Promise<{ ip: string; token: string | null; country: string | null; city: string | null; paper_count: number }[]> {
  const results = await db
    .prepare(
      `SELECT submitted_by_ip as ip, submitted_by_token as token,
       submitted_by_country as country, submitted_by_city as city,
       COUNT(*) as paper_count
       FROM papers
       WHERE submitted_by_ip IS NOT NULL
       GROUP BY COALESCE(submitted_by_token, submitted_by_ip)
       ORDER BY paper_count DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<{ ip: string; token: string | null; country: string | null; city: string | null; paper_count: number }>();

  return results.results;
}

// --- Ratings ---

export interface RatingRow {
  id: number;
  paper_id: string;
  rater_ip: string;
  stars: number;
  comment: string;
  voice_tier: string | null;  // 'plus3' | 'plus2' | 'plus1' | 'base' | null (legacy)
  created_at: string;
  updated_at: string;
}

/** Get a user's rating for a paper (by token if available, fallback to IP). */
export async function getRating(db: D1Database, paperId: string, ip: string, token?: string | null): Promise<RatingRow | null> {
  if (token) {
    const byToken = await db
      .prepare("SELECT * FROM ratings WHERE paper_id = ? AND rater_token = ?")
      .bind(paperId, token)
      .first<RatingRow>();
    if (byToken) return byToken;
  }
  return db
    .prepare("SELECT * FROM ratings WHERE paper_id = ? AND rater_ip = ?")
    .bind(paperId, ip)
    .first<RatingRow>();
}

// Bayesian average constants:
// C = prior weight (2 ratings worth of prior), m = prior mean (3.0 = midpoint of 1–5 scale).
// With C=2, ~5 real ratings are needed before the average meaningfully departs from 3.0.
const PRIOR_WEIGHT = 2;
const PRIOR_MEAN = 3.0;

/**
 * Recompute and persist Bayesian average, rating_count, rating_sum, and has_low_rating
 * for the given paper after any rating insert/delete.
 */
async function recomputeBayesianAvg(db: D1Database, paperId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE papers SET
         rating_count = (SELECT COUNT(*) FROM ratings WHERE paper_id = ?),
         rating_sum = (SELECT COALESCE(SUM(stars), 0) FROM ratings WHERE paper_id = ?),
         bayesian_avg = CASE
           WHEN (SELECT COUNT(*) FROM ratings WHERE paper_id = ?) = 0 THEN NULL
           ELSE CAST(
             (? * ? + COALESCE((SELECT SUM(stars) FROM ratings WHERE paper_id = ?), 0))
             AS REAL
           ) / (? + COALESCE((SELECT COUNT(*) FROM ratings WHERE paper_id = ?), 0))
         END,
         has_low_rating = EXISTS(SELECT 1 FROM ratings WHERE paper_id = ? AND stars <= 3)
       WHERE id = ?`
    )
    .bind(paperId, paperId, paperId, PRIOR_WEIGHT, PRIOR_MEAN, paperId, PRIOR_WEIGHT, paperId, paperId, paperId)
    .run();
}

/** Upsert a rating and update the paper's Bayesian average. */
export async function upsertRating(
  db: D1Database,
  paperId: string,
  ip: string,
  stars: number,
  comment: string,
  token?: string | null,
  voiceTier?: string | null
): Promise<RatingRow> {
  const vt = voiceTier ?? null;
  if (token) {
    // Delete any existing rating from this user (by token or same IP) to avoid
    // unique constraint conflicts. The partial unique index on (paper_id, rater_token)
    // WHERE rater_token IS NOT NULL doesn't support ON CONFLICT, so we use DELETE+INSERT.
    await db
      .prepare("DELETE FROM ratings WHERE paper_id = ? AND (rater_token = ? OR rater_ip = ?)")
      .bind(paperId, token, ip)
      .run();
    await db
      .prepare(
        `INSERT INTO ratings (paper_id, rater_ip, rater_token, stars, comment, voice_tier)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(paperId, ip, token, stars, comment, vt)
      .run();
  } else {
    // Legacy: upsert by IP
    await db
      .prepare(
        `INSERT INTO ratings (paper_id, rater_ip, stars, comment, voice_tier)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(paper_id, rater_ip) DO UPDATE SET
           stars = excluded.stars,
           comment = excluded.comment,
           voice_tier = excluded.voice_tier,
           updated_at = datetime('now')`
      )
      .bind(paperId, ip, stars, comment, vt)
      .run();
  }

  await recomputeBayesianAvg(db, paperId);

  return (await getRating(db, paperId, ip, token))!;
}

/** Delete a user's rating and recompute paper stats. */
export async function deleteRating(db: D1Database, paperId: string, ip: string, token?: string | null): Promise<void> {
  if (token) {
    await db
      .prepare("DELETE FROM ratings WHERE paper_id = ? AND rater_token = ?")
      .bind(paperId, token)
      .run();
  } else {
    await db
      .prepare("DELETE FROM ratings WHERE paper_id = ? AND rater_ip = ?")
      .bind(paperId, ip)
      .run();
  }

  await recomputeBayesianAvg(db, paperId);
}

/** Get all papers with rating data for admin curate page. */
export async function getAllPapersWithRatings(
  db: D1Database
): Promise<(Paper & { bayesian_avg: number | null; rating_count: number; has_low_rating: boolean; best_narration_tier: string | null })[]> {
  const results = await db
    .prepare(
      `SELECT p.*, nv.narration_tier as best_narration_tier
       FROM papers p
       LEFT JOIN narration_versions nv ON p.best_version_id = nv.id
       ORDER BY
         p.bayesian_avg ASC NULLS LAST,
         p.created_at DESC`
    )
    .all<Paper & { bayesian_avg: number | null; rating_count: number; has_low_rating: boolean; best_narration_tier: string | null }>();

  return results.results;
}

/** Get all ratings for a paper (admin, sorted worst first). */
export async function getAllRatingsForPaper(db: D1Database, paperId: string): Promise<RatingRow[]> {
  const results = await db
    .prepare("SELECT * FROM ratings WHERE paper_id = ? ORDER BY stars ASC, created_at DESC")
    .bind(paperId)
    .all<RatingRow>();
  return results.results;
}

/**
 * Determine the best voice tier for a paper based on its narration versions.
 * Returns 'plus3' (elevenlabs), 'plus2' (openai), 'plus1' (upgraded script, free voice), or 'base' (default narration).
 */
export async function getBestVoiceTier(db: D1Database, paperId: string): Promise<string> {
  // Check the best_version_id first — narration_tier is stored directly
  const paper = await getPaper(db, paperId);
  if (paper?.best_version_id) {
    const result = await db
      .prepare("SELECT narration_tier FROM narration_versions WHERE id = ? AND paper_id = ?")
      .bind(paper.best_version_id, paperId)
      .first<{ narration_tier: string }>();
    if (result?.narration_tier) return result.narration_tier;
  }
  // Fallback: highest tier across all versions for this paper
  const result = await db
    .prepare(
      `SELECT narration_tier FROM narration_versions
       WHERE paper_id = ? AND narration_tier != 'base'
       ORDER BY quality_rank DESC LIMIT 1`
    )
    .bind(paperId)
    .first<{ narration_tier: string }>();
  return result?.narration_tier ?? "base";
}

/** Clear all ratings for a paper and reset denormalized columns. */
export async function clearRatingsForPaper(db: D1Database, paperId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM ratings WHERE paper_id = ?").bind(paperId),
    db.prepare(
      `UPDATE papers SET rating_count = 0, rating_sum = 0, bayesian_avg = NULL, has_low_rating = 0
       WHERE id = ?`
    ).bind(paperId),
  ]);
}

/** Check if any papers have low ratings (for admin dashboard alert). */
export async function hasAnyLowRatings(db: D1Database): Promise<boolean> {
  const result = await db
    .prepare("SELECT EXISTS(SELECT 1 FROM papers WHERE has_low_rating = 1) as has_low")
    .first<{ has_low: number }>();
  return result?.has_low === 1;
}

// --- Lists ---

const LIST_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Generate a unique 6-char list ID with collision retry. Uses crypto.getRandomValues() for security. */
export async function generateListId(db: D1Database): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += LIST_ID_CHARS[bytes[i] % LIST_ID_CHARS.length];
    }
    const existing = await db
      .prepare("SELECT 1 FROM lists WHERE id = ?")
      .bind(id)
      .first();
    if (!existing) return id;
  }
  throw new Error("Failed to generate unique list ID");
}

/** Create a new list. Returns the list. */
export async function createList(
  db: D1Database,
  id: string,
  ownerToken: string,
  name: string,
  description: string,
  creatorIp: string | null,
  publiclyListed: number = 1
): Promise<List> {
  await db
    .prepare(
      `INSERT INTO lists (id, owner_token, name, description, creator_ip, publicly_listed)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, ownerToken, name, description, creatorIp, publiclyListed)
    .run();
  return (await getList(db, id))!;
}

/** Get a list by ID. */
export async function getList(db: D1Database, id: string): Promise<List | null> {
  return db.prepare("SELECT * FROM lists WHERE id = ?").bind(id).first<List>();
}

/** Get all lists owned by a token. */
export async function getListsByToken(db: D1Database, ownerToken: string): Promise<(List & { paper_count: number })[]> {
  const results = await db
    .prepare(
      `SELECT l.*, COALESCE(c.cnt, 0) as paper_count
       FROM lists l
       LEFT JOIN (SELECT list_id, COUNT(*) as cnt FROM list_items GROUP BY list_id) c ON c.list_id = l.id
       WHERE l.owner_token = ?
       ORDER BY l.created_at DESC`
    )
    .bind(ownerToken)
    .all<List & { paper_count: number }>();
  return results.results;
}

/** Get all lists with tokens (admin). */
export async function getAllLists(db: D1Database): Promise<(List & { paper_count: number })[]> {
  const results = await db
    .prepare(
      `SELECT l.*, COALESCE(c.cnt, 0) as paper_count
       FROM lists l
       LEFT JOIN (SELECT list_id, COUNT(*) as cnt FROM list_items GROUP BY list_id) c ON c.list_id = l.id
       ORDER BY l.created_at DESC`
    )
    .all<List & { paper_count: number }>();
  return results.results;
}

/** Update list name/description and optionally publicly_listed. */
export async function updateList(
  db: D1Database,
  id: string,
  name: string,
  description: string,
  publiclyListed?: number
): Promise<void> {
  if (publiclyListed !== undefined) {
    await db
      .prepare("UPDATE lists SET name = ?, description = ?, publicly_listed = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(name, description, publiclyListed, id)
      .run();
  } else {
    await db
      .prepare("UPDATE lists SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(name, description, id)
      .run();
  }
}

/** Delete a list and all its items. */
export async function deleteList(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM list_items WHERE list_id = ?").bind(id),
    db.prepare("DELETE FROM lists WHERE id = ?").bind(id),
  ]);
}

/** Get ordered paper IDs for a list. */
export async function getListItems(db: D1Database, listId: string): Promise<ListItem[]> {
  const results = await db
    .prepare("SELECT * FROM list_items WHERE list_id = ? ORDER BY position ASC")
    .bind(listId)
    .all<ListItem>();
  return results.results;
}

/** Add papers to a list. Skips duplicates. Returns count actually added. */
export async function addListItems(
  db: D1Database,
  listId: string,
  paperIds: string[]
): Promise<number> {
  if (paperIds.length === 0) return 0;
  // Get current max position
  const maxPos = await db
    .prepare("SELECT COALESCE(MAX(position), -1) as mp FROM list_items WHERE list_id = ?")
    .bind(listId)
    .first<{ mp: number }>();
  const startPos = (maxPos?.mp ?? -1) + 1;
  // Batch all inserts in a single round-trip; INSERT OR IGNORE silently skips duplicates
  const stmts = paperIds.map((paperId, i) =>
    db
      .prepare("INSERT OR IGNORE INTO list_items (list_id, paper_id, position) VALUES (?, ?, ?)")
      .bind(listId, paperId, startPos + i)
  );
  const results = await db.batch(stmts);
  return results.reduce((sum, r) => sum + (r.meta.changes ?? 0), 0);
}

/** Remove a paper from a list. */
export async function removeListItem(db: D1Database, listId: string, paperId: string): Promise<void> {
  await db
    .prepare("DELETE FROM list_items WHERE list_id = ? AND paper_id = ?")
    .bind(listId, paperId)
    .run();
}

/** Reorder list items. paper_ids is the full ordered array. */
export async function reorderListItems(
  db: D1Database,
  listId: string,
  orderedPaperIds: string[]
): Promise<void> {
  const stmts = orderedPaperIds.map((paperId, i) =>
    db
      .prepare("UPDATE list_items SET position = ? WHERE list_id = ? AND paper_id = ?")
      .bind(i, listId, paperId)
  );
  if (stmts.length > 0) {
    await db.batch(stmts);
  }
}

/** Get recently updated public lists (non-empty, named). */
export async function getRecentPublicLists(
  db: D1Database,
  limit: number = 20,
  offset: number = 0
): Promise<(List & { paper_count: number })[]> {
  const results = await db
    .prepare(
      `SELECT l.*, COALESCE(c.cnt, 0) as paper_count
       FROM lists l
       LEFT JOIN (SELECT list_id, COUNT(*) as cnt FROM list_items GROUP BY list_id) c ON c.list_id = l.id
       WHERE COALESCE(c.cnt, 0) >= 1
         AND l.name != '' AND l.name != 'Untitled Collection'
         AND l.publicly_listed = 1
       ORDER BY l.name COLLATE NOCASE ASC
       LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<List & { paper_count: number }>();
  return results.results;
}

/**
 * Atomically claim a paper for narration: transitions unnarrated or failed → narrating.
 * Returns true if this caller won the race, false if someone else already claimed it.
 */
export async function claimPaperForNarration(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE papers SET status = 'narrating', eta_seconds = NULL, updated_at = datetime('now') WHERE id = ? AND status IN ('unnarrated', 'failed')")
    .bind(id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Atomically claim a paper for premium upgrade narration.
 * Like claimPaperForNarration, but also allows already-narrated papers.
 */
export async function claimPaperForPremium(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE papers SET status = 'narrating', eta_seconds = NULL, progress_detail = NULL, updated_at = datetime('now') WHERE id = ? AND status IN ('unnarrated', 'failed', 'narrated')")
    .bind(id)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

// --- User Playlist ---

/** Get a user's playlist (ordered). */
export async function getUserPlaylist(db: D1Database, token: string): Promise<{ paper_id: string; position: number; added_at: string }[]> {
  const results = await db
    .prepare("SELECT paper_id, position, added_at FROM user_playlist WHERE user_token = ? ORDER BY position ASC")
    .bind(token)
    .all<{ paper_id: string; position: number; added_at: string }>();
  return results.results;
}

/** Set the full playlist (replaces existing). */
export async function setUserPlaylist(db: D1Database, token: string, paperIds: string[]): Promise<void> {
  const stmts = [
    db.prepare("DELETE FROM user_playlist WHERE user_token = ?").bind(token),
    ...paperIds.map((id, i) =>
      db.prepare("INSERT INTO user_playlist (user_token, paper_id, position) VALUES (?, ?, ?)").bind(token, id, i)
    ),
  ];
  await db.batch(stmts);
}

/** Add a paper to the end of a user's playlist. Returns true if added, false if duplicate. */
export async function addToUserPlaylist(db: D1Database, token: string, paperId: string): Promise<boolean> {
  const maxPos = await db
    .prepare("SELECT COALESCE(MAX(position), -1) as mp FROM user_playlist WHERE user_token = ?")
    .bind(token)
    .first<{ mp: number }>();
  try {
    await db
      .prepare("INSERT INTO user_playlist (user_token, paper_id, position) VALUES (?, ?, ?)")
      .bind(token, paperId, (maxPos?.mp ?? -1) + 1)
      .run();
    return true;
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return false;
    throw e;
  }
}

/** Remove a paper from a user's playlist. */
export async function removeFromUserPlaylist(db: D1Database, token: string, paperId: string): Promise<void> {
  await db
    .prepare("DELETE FROM user_playlist WHERE user_token = ? AND paper_id = ?")
    .bind(token, paperId)
    .run();
}

// --- User Listen History ---

/** Get a user's listen history (most recent first). */
export async function getUserListenHistory(db: D1Database, token: string): Promise<{ paper_id: string; read_at: string }[]> {
  const results = await db
    .prepare("SELECT paper_id, read_at FROM user_listen_history WHERE user_token = ? ORDER BY read_at DESC")
    .bind(token)
    .all<{ paper_id: string; read_at: string }>();
  return results.results;
}

/** Mark a paper as listened. */
export async function markPaperListened(db: D1Database, token: string, paperId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_listen_history (user_token, paper_id, read_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_token, paper_id) DO UPDATE SET read_at = datetime('now')`
    )
    .bind(token, paperId)
    .run();
}

/** Unmark a paper as listened. */
export async function unmarkPaperListened(db: D1Database, token: string, paperId: string): Promise<void> {
  await db
    .prepare("DELETE FROM user_listen_history WHERE user_token = ? AND paper_id = ?")
    .bind(token, paperId)
    .run();
}

/** Cleanup old visits and submissions (call periodically). */
export async function cleanup(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM page_visits WHERE visited_at < datetime('now', '-30 days')"),
    db.prepare("DELETE FROM submissions WHERE submitted_at < datetime('now', '-2 days')"),
  ]);
}

// --- Token Merge ---

/** Merge all backend data from oldToken into newToken (for device sync). */
export async function mergeTokens(db: D1Database, oldToken: string, newToken: string): Promise<void> {
  await db.batch([
    // Reassign submitted papers
    db.prepare("UPDATE papers SET submitted_by_token = ? WHERE submitted_by_token = ?").bind(newToken, oldToken),
    // Reassign visits (ignore duplicates)
    db.prepare("UPDATE OR IGNORE page_visits SET visitor_token = ? WHERE visitor_token = ?").bind(newToken, oldToken),
    // Clean up any duplicate visits that couldn't be updated
    db.prepare("DELETE FROM page_visits WHERE visitor_token = ?").bind(oldToken),
    // Reassign ratings (ignore duplicates — keep existing newToken rating)
    db.prepare("UPDATE OR IGNORE ratings SET rater_token = ? WHERE rater_token = ?").bind(newToken, oldToken),
    // Clean up any duplicate ratings that couldn't be updated
    db.prepare("DELETE FROM ratings WHERE rater_token = ?").bind(oldToken),
    // Reassign list ownership
    db.prepare("UPDATE lists SET owner_token = ? WHERE owner_token = ?").bind(newToken, oldToken),
    // Merge playlist (ignore duplicates)
    db.prepare("UPDATE OR IGNORE user_playlist SET user_token = ? WHERE user_token = ?").bind(newToken, oldToken),
    db.prepare("DELETE FROM user_playlist WHERE user_token = ?").bind(oldToken),
    // Merge listen history (ignore duplicates, keep newer read_at)
    db.prepare("UPDATE OR IGNORE user_listen_history SET user_token = ? WHERE user_token = ?").bind(newToken, oldToken),
    db.prepare("DELETE FROM user_listen_history WHERE user_token = ?").bind(oldToken),
    // Merge playback positions (keep the one updated most recently)
    db.prepare(
      `UPDATE playback_positions SET user_token = ?, updated_at = datetime('now')
       WHERE user_token = ? AND paper_id NOT IN (
         SELECT paper_id FROM playback_positions WHERE user_token = ? AND updated_at >= (
           SELECT updated_at FROM playback_positions p2 WHERE p2.user_token = ? AND p2.paper_id = playback_positions.paper_id
         )
       )`
    ).bind(newToken, oldToken, newToken, oldToken),
    // Clean up remaining old token positions
    db.prepare("DELETE FROM playback_positions WHERE user_token = ?").bind(oldToken),
  ]);
}

// --- Playback Positions ---

/** Save or update a playback position for a user/paper. */
export async function savePlaybackPosition(db: D1Database, token: string, paperId: string, position: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO playback_positions (user_token, paper_id, position, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_token, paper_id) DO UPDATE SET
         position = excluded.position,
         updated_at = datetime('now')`
    )
    .bind(token, paperId, position)
    .run();
}

/** Get all playback positions for a user. */
export async function getPlaybackPositions(db: D1Database, token: string): Promise<{ paper_id: string; position: number; updated_at: string }[]> {
  const results = await db
    .prepare("SELECT paper_id, position, updated_at FROM playback_positions WHERE user_token = ? ORDER BY updated_at DESC")
    .bind(token)
    .all<{ paper_id: string; position: number; updated_at: string }>();
  return results.results;
}

// --- Narration Versions ---

/** Insert a new narration version record. Returns the inserted row. */
export async function insertNarrationVersion(
  db: D1Database,
  v: {
    paper_id: string;
    narration_tier: "base" | "plus1" | "plus2" | "plus3";
    quality_rank: number;
    tts_provider?: string | null;
    tts_model?: string | null;
    llm_provider?: string | null;
    llm_model?: string | null;
    audio_r2_key?: string | null;
    transcript_r2_key?: string | null;
    duration_seconds?: number | null;
    actual_cost?: number | null;
    llm_cost?: number | null;
    tts_cost?: number | null;
    actual_input_tokens?: number | null;
    actual_output_tokens?: number | null;
    provider_model?: string | null;
  }
): Promise<NarrationVersion> {
  const result = await db
    .prepare(
      `INSERT INTO narration_versions
         (paper_id, narration_tier, quality_rank,
          tts_provider, tts_model, llm_provider, llm_model,
          audio_r2_key, transcript_r2_key, duration_seconds,
          actual_cost, llm_cost, tts_cost,
          actual_input_tokens, actual_output_tokens, provider_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .bind(
      v.paper_id,
      v.narration_tier,
      v.quality_rank,
      v.tts_provider ?? null,
      v.tts_model ?? null,
      v.llm_provider ?? null,
      v.llm_model ?? null,
      v.audio_r2_key ?? null,
      v.transcript_r2_key ?? null,
      v.duration_seconds ?? null,
      v.actual_cost ?? null,
      v.llm_cost ?? null,
      v.tts_cost ?? null,
      v.actual_input_tokens ?? null,
      v.actual_output_tokens ?? null,
      v.provider_model ?? null,
    )
    .first<NarrationVersion>();
  return result!;
}

/** Persist source archive stats on the papers row for cost estimation. */
export async function updatePaperSourceStats(
  db: D1Database,
  paperId: string,
  tarBytes: number,
  latexCharCount: number,
  figureCount: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE papers SET tar_bytes = ?, latex_char_count = ?, figure_count = ?
       WHERE id = ? AND (tar_bytes IS NULL OR tar_bytes = 0)`
    )
    .bind(tarBytes, latexCharCount, figureCount, paperId)
    .run();
}

/** Get a specific narration version by ID and paper ID. */
export async function getVersionById(db: D1Database, versionId: number, paperId: string): Promise<NarrationVersion | null> {
  return db
    .prepare("SELECT * FROM narration_versions WHERE id = ? AND paper_id = ?")
    .bind(versionId, paperId)
    .first<NarrationVersion>();
}

/** Get all narration versions for a paper, ordered best first. */
export async function getNarrationVersions(db: D1Database, paperId: string): Promise<NarrationVersion[]> {
  const results = await db
    .prepare("SELECT * FROM narration_versions WHERE paper_id = ? ORDER BY quality_rank DESC, created_at DESC")
    .bind(paperId)
    .all<NarrationVersion>();
  return results.results;
}

/**
 * Update best_version_id on a paper atomically — only upgrades, never downgrades.
 * Sets best_version_id to newVersionId only if newVersionId has a higher quality_rank
 * than the current best_version_id (or if best_version_id is currently NULL).
 */
export async function updateBestVersionId(db: D1Database, paperId: string, newVersionId: number): Promise<void> {
  await db
    .prepare(
      `UPDATE papers SET best_version_id = ?
       WHERE id = ?
         AND (
           best_version_id IS NULL
           OR (SELECT quality_rank FROM narration_versions WHERE id = ?)
              > (SELECT quality_rank FROM narration_versions WHERE id = best_version_id)
         )`
    )
    .bind(newVersionId, paperId, newVersionId)
    .run();
}

/**
 * Find the most recent premium script R2 key for a paper.
 * Returns the transcript_r2_key if a premium script exists, null otherwise.
 */
export async function findExistingPremiumScript(db: D1Database, paperId: string): Promise<string | null> {
  const result = await db
    .prepare(
      `SELECT transcript_r2_key FROM narration_versions
       WHERE paper_id = ? AND narration_tier != 'base' AND transcript_r2_key IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(paperId)
    .first<{ transcript_r2_key: string }>();
  return result?.transcript_r2_key ?? null;
}

/** Update script_char_count on a paper (from eager script generation). */
export async function updateScriptCharCount(db: D1Database, paperId: string, charCount: number): Promise<void> {
  await db
    .prepare("UPDATE papers SET script_char_count = ? WHERE id = ?")
    .bind(charCount, paperId)
    .run();
}

// ─── Narration Scores ─────────────────────────────────────────────────────────

export interface NarrationScore {
  id: number;
  version_id: number;
  scored_by: string;
  score_fidelity: number | null;
  score_citations: number | null;
  score_header: number | null;
  score_figures: number | null;
  score_tts: number | null;
  score_overall: number | null;
  notes: string | null;
  scored_at: string;
}

export interface NarrationVersionWithScore extends NarrationVersion {
  scored_by: string | null;
  score_fidelity: number | null;
  score_citations: number | null;
  score_header: number | null;
  score_figures: number | null;
  score_tts: number | null;
  score_overall: number | null;
  notes: string | null;
  scored_at: string | null;
}

/** Get all narration versions for a paper with their latest score (LEFT JOIN). */
export async function getVersionsWithScores(db: D1Database, paperId: string): Promise<NarrationVersionWithScore[]> {
  const results = await db
    .prepare(
      `SELECT nv.*,
              ns.scored_by, ns.score_fidelity, ns.score_citations,
              ns.score_header, ns.score_figures, ns.score_tts, ns.score_overall,
              ns.notes, ns.scored_at
       FROM narration_versions nv
       LEFT JOIN narration_scores ns ON ns.version_id = nv.id
         AND ns.id = (SELECT MAX(id) FROM narration_scores WHERE version_id = nv.id)
       WHERE nv.paper_id = ?
       ORDER BY nv.created_at DESC`
    )
    .bind(paperId)
    .all<NarrationVersionWithScore>();
  return results.results;
}

export interface InsertNarrationScoreInput {
  version_id: number;
  scored_by?: string;
  score_fidelity?: number | null;
  score_citations?: number | null;
  score_header?: number | null;
  score_figures?: number | null;
  score_tts?: number | null;
  score_overall?: number | null;
  notes?: string | null;
}

/** Insert a new narration quality score row. */
export async function insertNarrationScore(db: D1Database, input: InsertNarrationScoreInput): Promise<{ id: number }> {
  const result = await db
    .prepare(
      `INSERT INTO narration_scores
         (version_id, scored_by, score_fidelity, score_citations, score_header,
          score_figures, score_tts, score_overall, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .bind(
      input.version_id,
      input.scored_by ?? "eval-agent",
      input.score_fidelity ?? null,
      input.score_citations ?? null,
      input.score_header ?? null,
      input.score_figures ?? null,
      input.score_tts ?? null,
      input.score_overall ?? null,
      input.notes ?? null,
    )
    .first<{ id: number }>();
  if (!result) throw new Error("insertNarrationScore: no row returned");
  return result;
}

// ─── Score Trends ─────────────────────────────────────────────────────────────

export interface ScoreDailyRow {
  date: string;
  narration_tier: string;
  avg_overall: number | null;
  avg_fidelity: number | null;
  avg_citations: number | null;
  avg_header: number | null;
  avg_figures: number | null;
  avg_tts: number | null;
  count: number;
}

export interface ScoreSummaryRow {
  narration_tier: string;
  avg_overall: number | null;
  avg_fidelity: number | null;
  avg_citations: number | null;
  avg_header: number | null;
  avg_figures: number | null;
  avg_tts: number | null;
  total_count: number;
  avg_7d: number | null;
  count_7d: number;
  avg_prior_7d: number | null;
}

/**
 * Returns daily score averages (last 30 days, by tier) and all-time summary averages (by tier).
 * Used by the admin Quality Insights panel.
 */
export async function getScoreTrends(db: D1Database): Promise<{ daily: ScoreDailyRow[]; summary: ScoreSummaryRow[] }> {
  const [dailyResult, summaryResult] = await Promise.all([
    db.prepare(`
      SELECT date(ns.scored_at) as date,
             nv.narration_tier,
             AVG(ns.score_overall)   as avg_overall,
             AVG(ns.score_fidelity)  as avg_fidelity,
             AVG(ns.score_citations) as avg_citations,
             AVG(ns.score_header)    as avg_header,
             AVG(ns.score_figures)   as avg_figures,
             AVG(ns.score_tts)       as avg_tts,
             COUNT(*)                as count
      FROM narration_scores ns
      JOIN narration_versions nv ON nv.id = ns.version_id
      WHERE ns.scored_at >= date('now', '-30 days')
      GROUP BY date(ns.scored_at), nv.narration_tier
      ORDER BY date ASC
    `).all<ScoreDailyRow>(),

    db.prepare(`
      SELECT nv.narration_tier,
             AVG(ns.score_overall)   as avg_overall,
             AVG(ns.score_fidelity)  as avg_fidelity,
             AVG(ns.score_citations) as avg_citations,
             AVG(ns.score_header)    as avg_header,
             AVG(ns.score_figures)   as avg_figures,
             AVG(ns.score_tts)       as avg_tts,
             COUNT(*)                as total_count,
             AVG(CASE WHEN ns.scored_at >= date('now','-7 days') THEN ns.score_overall END) as avg_7d,
             SUM(CASE WHEN ns.scored_at >= date('now','-7 days') THEN 1 ELSE 0 END)         as count_7d,
             AVG(CASE WHEN ns.scored_at >= date('now','-14 days')
                       AND ns.scored_at < date('now','-7 days')
                      THEN ns.score_overall END) as avg_prior_7d
      FROM narration_scores ns
      JOIN narration_versions nv ON nv.id = ns.version_id
      GROUP BY nv.narration_tier
    `).all<ScoreSummaryRow>(),
  ]);

  return { daily: dailyResult.results, summary: summaryResult.results };
}
