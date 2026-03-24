/**
 * Paper CRUD and search handlers.
 */

import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import type { Env, Paper } from "../types";
import { paperToResponse } from "../types";
import { parseArxivId, scrapeArxivMetadata, searchArxiv } from "../arxiv";
import {
  getPaper,
  getPapersBatch,
  insertPaper,
  searchPapers,
  getPopularPapers,
  getRecentPapers,
  getAllPapers,
} from "../db";
import { json, getClientIp } from "./helpers";

export async function handleBatchPapers(request: Request, env: Env, baseUrl: string): Promise<Response> {
  const body = await request.json<{ ids?: string[] }>();
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return json({ error: "ids must be a non-empty array" }, 400);
  }
  if (ids.length > 50) {
    return json({ error: "Maximum 50 IDs per request" }, 400);
  }
  const papers = await getPapersBatch(env.DB, ids);
  return json({ papers: papers.map((p) => paperToResponse(p, baseUrl)) });
}

export async function handleArxivSearch(url: URL): Promise<Response> {
  const query = url.searchParams.get("q") || "";
  if (!query.trim()) {
    return json({ papers: [], total: 0, page: 1, per_page: 10 });
  }
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("per_page") || "10")));
  const start = (page - 1) * perPage;

  try {
    const result = await searchArxiv(query, start, perPage);
    return json({ papers: result.papers, total: result.total, page, per_page: perPage });
  } catch (e: any) {
    return json({ error: e.message }, 502);
  }
}

export async function handleListPapers(env: Env, url: URL, baseUrl: string): Promise<Response> {
  const query = url.searchParams.get("q") || "";
  const sort = url.searchParams.get("sort") || "popular";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("per_page") || "20")));
  const offset = (page - 1) * perPage;

  let papers: Paper[];

  if (query) {
    // Check if it's an arXiv URL/ID
    const arxivId = parseArxivId(query);
    if (arxivId) {
      const paper = await getPaper(env.DB, arxivId);
      papers = paper ? [paper] : [];
    } else {
      papers = await searchPapers(env.DB, query, perPage, offset);
    }
  } else if (sort === "recent") {
    const status = url.searchParams.get("status") || undefined;
    papers = await getRecentPapers(env.DB, perPage, offset, status);
  } else if (sort === "all") {
    papers = await getAllPapers(env.DB, perPage, offset);
  } else {
    papers = await getPopularPapers(env.DB, perPage, offset);
  }

  return json({
    papers: papers.map((p) => paperToResponse(p, baseUrl)),
    page,
    per_page: perPage,
  });
}

export async function handleGetPaper(env: Env, id: string, baseUrl: string): Promise<Response> {
  const paper = await getPaper(env.DB, id);
  if (!paper) {
    return json({ error: "Paper not found" }, 404);
  }
  return json(paperToResponse(paper, baseUrl));
}

export async function handlePreviewPaper(request: Request): Promise<Response> {
  const body = await request.json<{ arxiv_url?: string }>();

  if (!body.arxiv_url) {
    return json({ error: "arxiv_url is required" }, 400);
  }

  const arxivId = parseArxivId(body.arxiv_url);
  if (!arxivId) {
    return json({ error: "Invalid arXiv URL or ID" }, 400);
  }

  try {
    const metadata = await scrapeArxivMetadata(arxivId);
    return json({
      id: metadata.id,
      arxiv_url: metadata.arxiv_url,
      title: metadata.title,
      authors: metadata.authors,
      abstract: metadata.abstract,
      published_date: metadata.published_date,
      tex_source_url: metadata.tex_source_url,
    });
  } catch (e: any) {
    return json({ error: e.message }, 422);
  }
}

export async function handleSubmitPaper(
  request: Request,
  env: Env,
  baseUrl: string
): Promise<Response> {
  const body = await request.json<{
    arxiv_url?: string;
    metadata?: {
      id: string;
      arxiv_url: string;
      title: string;
      authors: string[];
      abstract: string;
      published_date: string;
      tex_source_url: string;
    };
  }>();

  if (!body.arxiv_url) {
    return json({ error: "arxiv_url is required" }, 400);
  }

  const arxivId = parseArxivId(body.arxiv_url);
  if (!arxivId) {
    return json({ error: "Invalid arXiv URL or ID" }, 400);
  }

  // Check if we already have this paper
  const existing = await getPaper(env.DB, arxivId);
  if (existing) {
    return json(paperToResponse(existing, baseUrl));
  }

  // Rate limit: 240 paper submissions per IP per day (admin bypasses).
  // Uses IP (not token) — consistent with narration limits; tokens are
  // client-generated and trivially regenerated to evade limits.
  const ip = getClientIp(request);
  const isAdmin = request.headers.get("X-Admin-Password") === env.ADMIN_PASSWORD && !!env.ADMIN_PASSWORD;
  if (!isAdmin) {
    const limit = parseInt(env.PAPER_SUBMISSION_DAILY_LIMIT || "240");
    const submissionsToday = await env.DB
      .prepare("SELECT COUNT(*) as cnt FROM papers WHERE submitted_by_ip = ? AND created_at > datetime('now', '-1 day')")
      .bind(ip)
      .first<{ cnt: number }>();
    if ((submissionsToday?.cnt ?? 0) >= limit) {
      return json({ error: "Daily paper submission limit reached. Try again tomorrow." }, 429);
    }
  }

  // --- Use pre-scraped metadata if provided, otherwise scrape ---
  let metadata;
  if (body.metadata && body.metadata.id === arxivId) {
    // Validate length limits on user-supplied metadata to prevent content injection.
    const t = body.metadata.title || "";
    const ab = body.metadata.abstract || "";
    const authors = body.metadata.authors;
    if (t.length > 500 || ab.length > 5000 || !Array.isArray(authors) || authors.length > 200) {
      return json({ error: "Metadata fields exceed allowed length" }, 400);
    }
    metadata = body.metadata;
  } else {
    try {
      metadata = await scrapeArxivMetadata(arxivId);
    } catch (e: any) {
      return json({ error: e.message }, 422);
    }
  }

  // --- Insert paper with status "unnarrated" ---
  const userToken = request.headers.get("X-User-Token") || undefined;
  const cf = (request as Request<unknown, IncomingRequestCfProperties>).cf;
  const inserted = await insertPaper(env.DB, {
    id: metadata.id,
    arxiv_url: metadata.arxiv_url,
    title: metadata.title,
    authors: metadata.authors,
    abstract: metadata.abstract,
    published_date: metadata.published_date,
    submitted_by_ip: ip,
    submitted_by_token: userToken,
    submitted_by_country: cf?.country || undefined,
    submitted_by_city: cf?.city || undefined,
  });

  if (!inserted) {
    // Race condition: another request inserted it
    const paper = await getPaper(env.DB, arxivId);
    return json(paperToResponse(paper!, baseUrl));
  }

  const paper = await getPaper(env.DB, arxivId);
  return json(paperToResponse(paper!, baseUrl), 201);
}
