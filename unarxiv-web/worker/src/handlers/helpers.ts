/**
 * Shared helpers used across all handler modules.
 */

import type { Env } from "../types";

/** Return a 401 Response if the request does not supply the correct admin password, else null. */
export function requireAdmin(request: Request, env: Env): Response | null {
  const password = request.headers.get("X-Admin-Password");
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

export function json(data: any, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Extract the user token from request headers.
 * Used by playlist, listen history, and list handlers.
 */
export function getUserToken(request: Request): string {
  return request.headers.get("X-User-Token") || "";
}

/**
 * Extract the list token from request headers.
 * Used by list CRUD handlers.
 */
export function getListToken(request: Request): string {
  return request.headers.get("X-List-Token") || "";
}

/**
 * Extract the client IP from the request.
 */
export function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}
