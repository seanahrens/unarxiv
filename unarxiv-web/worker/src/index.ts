/**
 * unarXiv API — Cloudflare Worker
 *
 * See buildRouteTable() below for the complete list of API routes.
 */

import type { Env } from "./types";
import { json } from "./handlers/helpers";
import {
  handleBatchPapers,
  handleArxivSearch,
  handleListPapers,
  handleGetPaper,
  handlePreviewPaper,
  handleSubmitPaper,
} from "./handlers/papers";
import {
  handleNarrateUpgrade,
  handleEstimate,
  handleGetVersions,
  handleEncryptKey,
  handleValidateKey,
  handleDeleteUpgradeVersions,
} from "./handlers/upgrade";
import {
  handleNarratePaper,
  handleNarrationCheck,
  handleReprocessPaper,
  handleDeletePaper,
  handleGetAudio,
  handleGetTranscript,
  handleGetProgress,
  handleRecordVisit,
  handleModalWebhook,
  recoverStalePapers,
} from "./handlers/narration";
import {
  handleRating,
  handleMyAdditions,
  handleDeleteMyAddition,
  handleGetPlaylist,
  handleUpdatePlaylist,
  handleAddToPlaylist,
  handleRemoveFromPlaylist,
  handleGetListenHistory,
  handleMarkListened,
  handleUnmarkListened,
  handleMergeTokens,
  handleSavePosition,
  handleGetPositions,
} from "./handlers/user";
import {
  handleCreateList,
  handleMyLists,
  handleRecentLists,
  handleGetList,
  handleUpdateList,
  handleDeleteList,
  handleAddListItems,
  handleRemoveListItem,
  handleReorderList,
  handleImportList,
} from "./handlers/lists";
import {
  handleAdminVerify,
  handleAdminStats,
  handleAdminPapersWithRatings,
  handleAdminPaperRatings,
  handleAdminClearRatings,
  handleAdminHasLowRatings,
  handleAdminLists,
  handleAdminCostTrainingData,
  handleAdminStoreModelCoefficients,
  handleAdminGetVersionsWithScores,
  handleAdminSubmitScore,
  handleAdminScoreStats,
  handleAdminRegisterParserVersion,
} from "./handlers/admin";
import { cleanup } from "./db";
import { curateHuggingFaceTopPapers } from "./handlers/curation";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const origin = request.headers.get("Origin") || "";
    const isAllowed =
      origin === "https://unarxiv.org" || origin.startsWith("http://localhost:");
    const corsOrigin = isAllowed ? origin : "https://unarxiv.org";
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password, X-List-Token, X-User-Token",
      "Access-Control-Expose-Headers": "Last-Modified",
    };

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const response = await handleRequest(request, env, url, path, method, ctx);
      // Add CORS headers to all responses
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
      }

      return response;
    } catch (e: any) {
      console.error("Unhandled error:", e);
      return json({ error: "Internal server error" }, 500, corsHeaders);
    }
  },

  // Scheduled: cleanup old data + recover stuck narrations (every 15 min)
  // Hourly (0 * * * *): also curate top HuggingFace papers
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await cleanup(env.DB);
    await recoverStalePapers(env);
    if (event.cron === "0 * * * *") {
      await curateHuggingFaceTopPapers(env);
    }
  },
};

/** Pattern for a 6-character list ID (lowercase alphanumeric). */
const LIST_ID_PATTERN = "[a-z0-9]{6}";

// ─── Route Table ─────────────────────────────────────────────────────────────

type RouteHandler = (
  request: Request,
  env: Env,
  url: URL,
  matches: RegExpMatchArray,
  ctx?: ExecutionContext
) => Promise<Response>;

interface RouteEntry {
  method: string | null; // null = any method (for multi-method handlers like rating)
  pattern: RegExp;
  handler: RouteHandler;
}

function buildRouteTable(baseUrl: string): RouteEntry[] {
  return [
    // Static paths — listed before regex patterns to preserve priority
    {
      method: "POST",
      pattern: /^\/api\/papers\/preview$/,
      handler: (req) => handlePreviewPaper(req),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/batch$/,
      handler: (req, env) => handleBatchPapers(req, env, baseUrl),
    },
    {
      method: "GET",
      pattern: /^\/api\/arxiv\/search$/,
      handler: (_req, _env, url) => handleArxivSearch(url),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers$/,
      handler: (req, env, url) => handleListPapers(env, url, baseUrl),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers$/,
      handler: (req, env) => handleSubmitPaper(req, env, baseUrl),
    },
    {
      method: "GET",
      pattern: /^\/api\/narration-check$/,
      handler: (req, env) => handleNarrationCheck(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/my-additions$/,
      handler: (req, env) => handleMyAdditions(req, env, baseUrl),
    },
    {
      method: "POST",
      pattern: /^\/api\/admin\/verify$/,
      handler: (req, env) => handleAdminVerify(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/stats$/,
      handler: (req, env) => handleAdminStats(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/papers-with-ratings$/,
      handler: (req, env) => handleAdminPapersWithRatings(req, env, baseUrl),
    },
    {
      method: "POST",
      pattern: /^\/api\/admin\/clear-ratings$/,
      handler: (req, env) => handleAdminClearRatings(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/has-low-ratings$/,
      handler: (req, env) => handleAdminHasLowRatings(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/lists$/,
      handler: (req, env) => handleAdminLists(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/cost-training-data$/,
      handler: (req, env) => handleAdminCostTrainingData(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/admin\/model-coefficients$/,
      handler: (req, env) => handleAdminStoreModelCoefficients(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/score-stats$/,
      handler: (req, env) => handleAdminScoreStats(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/papers\/([\w.-]+)\/versions$/,
      handler: (req, env, _url, m) => handleAdminGetVersionsWithScores(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/admin\/scores$/,
      handler: (req, env) => handleAdminSubmitScore(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/admin\/parser-versions$/,
      handler: (req, env) => handleAdminRegisterParserVersion(req, env),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/admin\/papers\/([\w.-]+)\/upgrade-versions$/,
      handler: (req, env, _url, m) => handleDeleteUpgradeVersions(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/lists$/,
      handler: (req, env) => handleCreateList(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/my-lists$/,
      handler: (req, env) => handleMyLists(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/playlist$/,
      handler: (req, env) => handleGetPlaylist(req, env),
    },
    {
      method: "PUT",
      pattern: /^\/api\/playlist$/,
      handler: (req, env) => handleUpdatePlaylist(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/playlist$/,
      handler: (req, env) => handleAddToPlaylist(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/listen-history$/,
      handler: (req, env) => handleGetListenHistory(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/merge-tokens$/,
      handler: (req, env) => handleMergeTokens(req, env),
    },
    {
      method: "GET",
      pattern: /^\/api\/playback-positions$/,
      handler: (req, env) => handleGetPositions(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/webhooks\/modal$/,
      handler: (req, env) => handleModalWebhook(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/keys\/encrypt$/,
      handler: (req, env) => handleEncryptKey(req, env),
    },
    {
      method: "POST",
      pattern: /^\/api\/keys\/validate$/,
      handler: (req, env) => handleValidateKey(req, env),
    },
    // Regex patterns with capture groups
    // Paper IDs use (.+?) to support old-style arXiv IDs with slashes (e.g. astro-ph/9905136)
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/audio$/,
      handler: (_req, env, url, m) => handleGetAudio(env, m[1], url),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/transcript$/,
      handler: (_req, env, url, m) => handleGetTranscript(env, m[1], url),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/progress$/,
      handler: (_req, env, _url, m) => handleGetProgress(env, m[1], baseUrl),
    },
    {
      method: null, // GET, POST, DELETE
      pattern: /^\/api\/papers\/(.+?)\/rating$/,
      handler: (req, env, _url, m) => handleRating(req, env, m[1]),
    },
    {
      method: "PUT",
      pattern: /^\/api\/papers\/([^/]+)\/position$/,
      handler: (req, env, _url, m) => handleSavePosition(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/playlist\/([^/]+)$/,
      handler: (req, env, _url, m) => handleRemoveFromPlaylist(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/([^/]+)\/listened$/,
      handler: (req, env, _url, m) => handleMarkListened(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/papers\/([^/]+)\/listened$/,
      handler: (req, env, _url, m) => handleUnmarkListened(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/(.+?)\/visit$/,
      handler: (req, env, _url, m) => handleRecordVisit(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/(.+?)\/narrate$/,
      handler: (req, env, _url, m, ctx) => handleNarratePaper(req, env, m[1], baseUrl, ctx),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/(.+?)\/narrate-upgrade$/,
      handler: (req, env, _url, m, ctx) => handleNarrateUpgrade(req, env, m[1], baseUrl, ctx),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/estimate$/,
      handler: (_req, env, _url, m) => handleEstimate(env, m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+?)\/versions$/,
      handler: (_req, env, _url, m) => handleGetVersions(env, m[1], baseUrl),
    },
    {
      method: "POST",
      pattern: /^\/api\/papers\/(.+?)\/reprocess$/,
      handler: (req, env, _url, m, ctx) => handleReprocessPaper(req, env, m[1], baseUrl, ctx),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/my-additions\/(.+)$/,
      handler: (req, env, _url, m) => handleDeleteMyAddition(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: /^\/api\/papers\/(.+)$/,
      handler: (req, env, _url, m) => handleDeletePaper(req, env, m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/papers\/(.+)$/,
      handler: (_req, env, _url, m) => handleGetPaper(env, m[1], baseUrl),
    },
    {
      method: "GET",
      pattern: /^\/api\/admin\/papers\/(.+?)\/ratings$/,
      handler: (req, env, _url, m) => handleAdminPaperRatings(req, env, m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/lists\/recent$/,
      handler: (_req, env, url) => handleRecentLists(env, url),
    },
    {
      method: "GET",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})$`),
      handler: (req, env, _url, m) => handleGetList(req, env, m[1], baseUrl),
    },
    {
      method: "PUT",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})$`),
      handler: (req, env, _url, m) => handleUpdateList(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})$`),
      handler: (req, env, _url, m) => handleDeleteList(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})\\/items$`),
      handler: (req, env, _url, m) => handleAddListItems(req, env, m[1]),
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})\\/items\\/([^/]+)$`),
      handler: (req, env, _url, m) => handleRemoveListItem(req, env, m[1], m[2]),
    },
    {
      method: "PUT",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})\\/reorder$`),
      handler: (req, env, _url, m) => handleReorderList(req, env, m[1]),
    },
    {
      method: "POST",
      pattern: new RegExp(`^\\/api\\/lists\\/(${LIST_ID_PATTERN})\\/import$`),
      handler: (req, env, _url, m) => handleImportList(req, env, m[1], baseUrl),
    },
  ];
}

async function handleRequest(
  request: Request,
  env: Env,
  url: URL,
  path: string,
  method: string,
  ctx?: ExecutionContext
): Promise<Response> {
  const baseUrl = url.origin;
  const routes = buildRouteTable(baseUrl);

  for (const route of routes) {
    if (route.method !== null && route.method !== method) continue;
    const m = path.match(route.pattern);
    if (m) {
      return route.handler(request, env, url, m, ctx);
    }
  }

  return json({ error: "Not found" }, 404);
}
