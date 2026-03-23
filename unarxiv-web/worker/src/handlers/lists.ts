/**
 * List/collection CRUD handlers.
 */

import type { IncomingRequestCfProperties } from "@cloudflare/workers-types";
import type { Env } from "../types";
import { paperToResponse } from "../types";
import { parseArxivId, scrapeArxivMetadata } from "../arxiv";
import {
  generateListId,
  createList,
  getList,
  getListsByToken,
  updateList,
  deleteList,
  getListItems,
  addListItems,
  removeListItem,
  reorderListItems,
  getRecentPublicLists,
  getPaper,
  getPapersBatch,
  insertPaper,
} from "../db";
import { json, getClientIp } from "./helpers";

export async function handleCreateList(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ name?: string; description?: string; publicly_listed?: boolean }>();
  if (!body.name || !body.name.trim()) {
    return json({ error: "name is required" }, 400);
  }
  if (body.name.trim().length > 200) {
    return json({ error: "name must be 200 characters or fewer" }, 400);
  }
  if ((body.description || "").trim().length > 1000) {
    return json({ error: "description must be 1000 characters or fewer" }, 400);
  }
  const id = await generateListId(env.DB);
  const ownerToken = crypto.randomUUID().replace(/-/g, "");
  const ip = request.headers.get("CF-Connecting-IP") || null;
  const publiclyListed = body.publicly_listed === false ? 0 : 1;
  const list = await createList(env.DB, id, ownerToken, body.name.trim(), (body.description || "").trim(), ip, publiclyListed);
  return json({
    list: { id: list.id, name: list.name, description: list.description, publicly_listed: !!list.publicly_listed, created_at: list.created_at, updated_at: list.updated_at, paper_count: 0 },
    owner_token: ownerToken,
  }, 201);
}

export async function handleMyLists(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  if (!token) return json({ error: "X-List-Token header required" }, 401);
  const lists = await getListsByToken(env.DB, token);
  return json({
    lists: lists.map((l) => ({
      id: l.id, name: l.name, description: l.description, publicly_listed: !!l.publicly_listed,
      created_at: l.created_at, updated_at: l.updated_at, paper_count: l.paper_count,
    })),
  });
}

export async function handleRecentLists(env: Env, url: URL): Promise<Response> {
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10")));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0"));
  const lists = await getRecentPublicLists(env.DB, limit, offset);
  return json({
    lists: lists.map((l) => ({
      id: l.id, name: l.name, description: l.description, publicly_listed: !!l.publicly_listed,
      created_at: l.created_at, updated_at: l.updated_at, paper_count: l.paper_count,
    })),
  });
}

export async function handleGetList(request: Request, env: Env, listId: string, baseUrl: string): Promise<Response> {
  const list = await getList(env.DB, listId);
  if (!list) return json({ error: "List not found" }, 404);
  const items = await getListItems(env.DB, list.id);
  const paperIds = items.map((i) => i.paper_id);
  const papers = paperIds.length > 0 ? await getPapersBatch(env.DB, paperIds) : [];
  const paperMap = new Map(papers.map((p) => [p.id, p]));
  const orderedPapers = paperIds.map((id) => {
    const p = paperMap.get(id);
    return p ? paperToResponse(p, baseUrl) : { id, not_found: true };
  });
  return json({
    list: { id: list.id, name: list.name, description: list.description, publicly_listed: !!list.publicly_listed, created_at: list.created_at, updated_at: list.updated_at, paper_count: items.length },
    papers: orderedPapers,
  });
}

export async function handleUpdateList(request: Request, env: Env, listId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  const body = await request.json<{ name?: string; description?: string; publicly_listed?: boolean }>();
  if (body.name !== undefined && body.name.trim().length > 200) {
    return json({ error: "name must be 200 characters or fewer" }, 400);
  }
  if (body.description !== undefined && body.description.trim().length > 1000) {
    return json({ error: "description must be 1000 characters or fewer" }, 400);
  }
  const publiclyListed = body.publicly_listed !== undefined ? (body.publicly_listed ? 1 : 0) : undefined;
  await updateList(env.DB, list.id, (body.name ?? list.name).trim(), (body.description ?? list.description).trim(), publiclyListed);
  return json({ ok: true });
}

export async function handleDeleteList(request: Request, env: Env, listId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const adminPw = request.headers.get("X-Admin-Password");
  const isAdmin = adminPw && adminPw === env.ADMIN_PASSWORD;
  const list = await getList(env.DB, listId);
  if (!list) return json({ error: "Not found" }, 404);
  if (!isAdmin && list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  await deleteList(env.DB, list.id);
  return json({ ok: true });
}

export async function handleAddListItems(request: Request, env: Env, listId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  const body = await request.json<{ paper_ids?: string[] }>();
  if (!body.paper_ids || !Array.isArray(body.paper_ids)) {
    return json({ error: "paper_ids array required" }, 400);
  }
  const added = await addListItems(env.DB, list.id, body.paper_ids);
  return json({ ok: true, added });
}

export async function handleRemoveListItem(request: Request, env: Env, listId: string, paperId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  await removeListItem(env.DB, list.id, paperId);
  return json({ ok: true });
}

export async function handleReorderList(request: Request, env: Env, listId: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  const body = await request.json<{ paper_ids?: string[] }>();
  if (!body.paper_ids || !Array.isArray(body.paper_ids)) {
    return json({ error: "paper_ids array required" }, 400);
  }
  await reorderListItems(env.DB, list.id, body.paper_ids);
  return json({ ok: true });
}

export async function handleImportList(request: Request, env: Env, listId: string, baseUrl: string): Promise<Response> {
  const token = request.headers.get("X-List-Token");
  const list = await getList(env.DB, listId);
  if (!list || list.owner_token !== token) return json({ error: "Unauthorized" }, 403);
  const body = await request.json<{ raw_text?: string }>();
  if (!body.raw_text) return json({ error: "raw_text required" }, 400);

  const chunks = body.raw_text.split(/[\s,;]+/).filter(Boolean);
  const parsed = new Map<string, boolean>();
  const invalid: string[] = [];
  for (const chunk of chunks) {
    const id = parseArxivId(chunk);
    if (id) {
      parsed.set(id, true);
    } else if (chunk.trim()) {
      invalid.push(chunk);
    }
  }

  const ids = [...parsed.keys()];
  if (ids.length === 0) {
    return json({ added: [], invalid });
  }

  const existing = await getPapersBatch(env.DB, ids);
  const existingIds = new Set(existing.map((p) => p.id));
  const missing = ids.filter((id) => !existingIds.has(id));

  const ip = getClientIp(request);
  const importToken = request.headers.get("X-User-Token") || undefined;
  const cf = (request as Request<unknown, IncomingRequestCfProperties>).cf;
  const toAdd = missing.slice(0, 20);
  for (const arxivId of toAdd) {
    try {
      const meta = await scrapeArxivMetadata(arxivId);
      await insertPaper(env.DB, {
        id: meta.id,
        arxiv_url: meta.arxiv_url,
        title: meta.title,
        authors: meta.authors,
        abstract: meta.abstract,
        published_date: meta.published_date,
        submitted_by_ip: ip,
        submitted_by_token: importToken,
        submitted_by_country: cf?.country || undefined,
        submitted_by_city: cf?.city || undefined,
      });
    } catch {
      invalid.push(arxivId);
    }
  }
  for (const id of missing.slice(20)) {
    invalid.push(id);
  }

  const validIds = ids.filter((id) => !invalid.includes(id));
  const actuallyAdded = await addListItems(env.DB, list.id, validIds);
  const duplicateCount = validIds.length - actuallyAdded;

  const allPapers = validIds.length > 0 ? await getPapersBatch(env.DB, validIds) : [];
  return json({
    added: allPapers.map((p) => paperToResponse(p, baseUrl)),
    duplicates: duplicateCount,
    invalid,
  });
}
