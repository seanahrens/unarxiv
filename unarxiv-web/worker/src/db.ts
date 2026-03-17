/**
 * Database queries for D1.
 */
import type { Paper, PaperStatus, List, ListItem } from "./types";

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
    submitted_by_country?: string;
    submitted_by_city?: string;
  }
): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO papers (id, arxiv_url, title, authors, abstract, published_date, status,
         submitted_by_ip, submitted_by_country, submitted_by_city)
         VALUES (?, ?, ?, ?, ?, ?, 'not_requested', ?, ?, ?)`
      )
      .bind(
        paper.id,
        paper.arxiv_url,
        paper.title,
        JSON.stringify(paper.authors),
        paper.abstract,
        paper.published_date,
        paper.submitted_by_ip || null,
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
    audio_r2_key?: string;
    audio_size_bytes?: number;
    duration_seconds?: number;
  }
): Promise<void> {
  const sets = ["status = ?"];
  const values: any[] = [status];

  if (details?.progress_detail !== undefined) {
    sets.push("progress_detail = ?");
    values.push(details.progress_detail);
  }
  if (details?.error_message !== undefined) {
    sets.push("error_message = ?");
    values.push(details.error_message);
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
  if (status === "complete") {
    sets.push("completed_at = datetime('now')");
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
  // Sanitize FTS query: escape special chars, add prefix matching
  const sanitized = query
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => `"${w}"*`)
    .join(" ");

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

/** Record a unique page visit (one per IP per paper). */
export async function recordVisit(db: D1Database, paperId: string, ip: string): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO page_visits (paper_id, visitor_ip) VALUES (?, ?)")
    .bind(paperId, ip)
    .run();
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

/** Reset a paper for reprocessing: update metadata and set status to queued. */
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
       status = 'queued', progress_detail = NULL, error_message = NULL,
       audio_r2_key = NULL, audio_size_bytes = NULL, duration_seconds = NULL, completed_at = NULL
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

/** Get top contributors by IP (for admin). */
export async function getTopContributors(
  db: D1Database,
  limit: number = 10
): Promise<{ ip: string; country: string | null; city: string | null; paper_count: number }[]> {
  const results = await db
    .prepare(
      `SELECT submitted_by_ip as ip, submitted_by_country as country, submitted_by_city as city,
       COUNT(*) as paper_count
       FROM papers
       WHERE submitted_by_ip IS NOT NULL
       GROUP BY submitted_by_ip
       ORDER BY paper_count DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<{ ip: string; country: string | null; city: string | null; paper_count: number }>();

  return results.results;
}

// --- Ratings ---

export interface RatingRow {
  id: number;
  paper_id: string;
  rater_ip: string;
  stars: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

/** Get a user's rating for a paper. */
export async function getRating(db: D1Database, paperId: string, ip: string): Promise<RatingRow | null> {
  return db
    .prepare("SELECT * FROM ratings WHERE paper_id = ? AND rater_ip = ?")
    .bind(paperId, ip)
    .first<RatingRow>();
}

/** Upsert a rating and update the paper's Bayesian average. */
export async function upsertRating(
  db: D1Database,
  paperId: string,
  ip: string,
  stars: number,
  comment: string
): Promise<RatingRow> {
  // Upsert the rating
  await db
    .prepare(
      `INSERT INTO ratings (paper_id, rater_ip, stars, comment)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(paper_id, rater_ip) DO UPDATE SET
         stars = excluded.stars,
         comment = excluded.comment,
         updated_at = datetime('now')`
    )
    .bind(paperId, ip, stars, comment)
    .run();

  // Recompute Bayesian average for this paper
  // Bayesian average: (C * m + sum_ratings) / (C + n)
  // where C = prior weight (e.g. 2), m = global mean (default 3.0)
  const PRIOR_WEIGHT = 2;
  const PRIOR_MEAN = 3.0;
  await db
    .prepare(
      `UPDATE papers SET
         rating_count = (SELECT COUNT(*) FROM ratings WHERE paper_id = ?),
         rating_sum = (SELECT COALESCE(SUM(stars), 0) FROM ratings WHERE paper_id = ?),
         bayesian_avg = CAST(
           (? * ? + COALESCE((SELECT SUM(stars) FROM ratings WHERE paper_id = ?), 0))
           AS REAL
         ) / (? + COALESCE((SELECT COUNT(*) FROM ratings WHERE paper_id = ?), 0)),
         has_low_rating = EXISTS(SELECT 1 FROM ratings WHERE paper_id = ? AND stars <= 3)
       WHERE id = ?`
    )
    .bind(paperId, paperId, PRIOR_WEIGHT, PRIOR_MEAN, paperId, PRIOR_WEIGHT, paperId, paperId, paperId)
    .run();

  return (await getRating(db, paperId, ip))!;
}

/** Delete a user's rating and recompute paper stats. */
export async function deleteRatingForIp(db: D1Database, paperId: string, ip: string): Promise<void> {
  await db
    .prepare("DELETE FROM ratings WHERE paper_id = ? AND rater_ip = ?")
    .bind(paperId, ip)
    .run();

  // Recompute Bayesian average
  const PRIOR_WEIGHT = 2;
  const PRIOR_MEAN = 3.0;
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

/** Get all papers with rating data for admin curate page. */
export async function getAllPapersWithRatings(
  db: D1Database
): Promise<(Paper & { bayesian_avg: number | null; rating_count: number; has_low_rating: boolean })[]> {
  const results = await db
    .prepare(
      `SELECT * FROM papers
       ORDER BY
         bayesian_avg ASC NULLS LAST,
         created_at DESC`
    )
    .all<Paper & { bayesian_avg: number | null; rating_count: number; has_low_rating: boolean }>();

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

/** Generate a unique 4-char list ID with collision retry. */
export async function generateListId(db: D1Database): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let id = "";
    for (let i = 0; i < 4; i++) {
      id += LIST_ID_CHARS[Math.floor(Math.random() * LIST_ID_CHARS.length)];
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
  creatorIp: string | null
): Promise<List> {
  await db
    .prepare(
      `INSERT INTO lists (id, owner_token, name, description, creator_ip)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, ownerToken, name, description, creatorIp)
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

/** Update list name/description. */
export async function updateList(
  db: D1Database,
  id: string,
  name: string,
  description: string
): Promise<void> {
  await db
    .prepare("UPDATE lists SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(name, description, id)
    .run();
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

/** Cleanup old visits and submissions (call periodically). */
export async function cleanup(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM page_visits WHERE visited_at < datetime('now', '-30 days')"),
    db.prepare("DELETE FROM submissions WHERE submitted_at < datetime('now', '-2 days')"),
  ]);
}
