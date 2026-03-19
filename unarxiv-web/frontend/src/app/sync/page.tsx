"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mergeTokensApi } from "@/lib/api";

const SYNC_KEYS = ["user_token", "list_tokens", "playlist", "read_papers"];

export default function SyncPage() {
  const [status, setStatus] = useState<"loading" | "imported" | "empty">("loading");
  const [counts, setCounts] = useState<{ lists: number; playlist: number; history: number; identity: boolean }>({ lists: 0, playlist: 0, history: 0, identity: false });

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) {
      setStatus("empty");
      return;
    }

    (async () => {
    try {
      const json = decodeURIComponent(atob(hash));
      const data = JSON.parse(json) as Record<string, unknown>;

      let lists = 0, playlist = 0, history = 0, identity = false;

      // Always adopt the sender's token and merge backend data
      if (data.user_token && typeof data.user_token === "string") {
        let existingToken: string | null = null;
        try {
          const raw = localStorage.getItem("user_token");
          if (raw) existingToken = JSON.parse(raw);
        } catch {}

        const incomingToken = data.user_token;
        if (existingToken && existingToken !== incomingToken) {
          // Merge backend data from old token into new token
          try {
            await mergeTokensApi(existingToken, incomingToken);
          } catch {
            // Continue anyway — local merge is still valuable
          }

          // Update ownerToken in local list_tokens to match new identity
          try {
            const raw = localStorage.getItem("list_tokens");
            if (raw) {
              const tokens = JSON.parse(raw) as Record<string, { ownerToken: string; name?: string }>;
              for (const key of Object.keys(tokens)) {
                if (tokens[key].ownerToken === existingToken) {
                  tokens[key].ownerToken = incomingToken;
                }
              }
              localStorage.setItem("list_tokens", JSON.stringify(tokens));
            }
          } catch {}
        }

        localStorage.setItem("user_token", JSON.stringify(incomingToken));
        identity = !existingToken || existingToken !== incomingToken;
      }

      for (const key of SYNC_KEYS) {
        if (key === "user_token") continue; // handled above
        if (!(key in data)) continue;
        const incoming = data[key];
        if (!incoming) continue;

        // Merge with existing data rather than overwriting
        const existing = (() => {
          try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
        })();

        if (key === "list_tokens" && typeof incoming === "object" && !Array.isArray(incoming)) {
          const merged = { ...(existing || {}), ...(incoming as Record<string, unknown>) };
          localStorage.setItem(key, JSON.stringify(merged));
          lists = Object.keys(incoming as object).length;
        } else if (key === "playlist" && Array.isArray(incoming)) {
          const existingArr: { paperId: string }[] = Array.isArray(existing) ? existing : [];
          const existingIds = new Set(existingArr.map((e) => e.paperId));
          const newEntries = (incoming as { paperId: string }[]).filter((e) => !existingIds.has(e.paperId));
          const merged = [...existingArr, ...newEntries];
          localStorage.setItem(key, JSON.stringify(merged));
          playlist = newEntries.length;
        } else if (key === "read_papers" && typeof incoming === "object" && !Array.isArray(incoming)) {
          const merged = { ...(existing || {}), ...(incoming as Record<string, unknown>) };
          localStorage.setItem(key, JSON.stringify(merged));
          history = Object.keys(incoming as object).length;
        }
      }

      setCounts({ lists, playlist, history, identity });
      setStatus("imported");

      // Strip the hash from URL so it's not bookmarkable with data
      window.history.replaceState(null, "", "/sync");
    } catch {
      setStatus("empty");
    }
    })();
  }, []);

  return (
    <div className="max-w-md mx-auto mt-16 text-center">
      {status === "loading" && (
        <p className="text-stone-500 text-sm">Syncing...</p>
      )}

      {status === "imported" && (
        <div className="space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-stone-900">Synced!</h1>
          <p className="text-sm text-stone-500">
            Your data from another device has been merged into this browser.
          </p>
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-left text-sm text-stone-600 space-y-1">
            {counts.identity && <p>Account identity linked</p>}
            {counts.lists > 0 && <p>{counts.lists} collection{counts.lists > 1 ? "s" : ""} linked</p>}
            {counts.playlist > 0 && <p>{counts.playlist} paper{counts.playlist > 1 ? "s" : ""} added to playlist</p>}
            {counts.history > 0 && <p>{counts.history} listen history entr{counts.history > 1 ? "ies" : "y"} synced</p>}
            {!counts.identity && counts.lists === 0 && counts.playlist === 0 && counts.history === 0 && (
              <p>Everything was already in sync.</p>
            )}
          </div>
          <Link
            href="/my-papers"
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-stone-900 hover:bg-stone-700 rounded-full transition-colors no-underline"
          >
            Go to My Papers
          </Link>
        </div>
      )}

      {status === "empty" && (
        <div className="space-y-4">
          <h1 className="text-xl font-bold text-stone-900">Device Sync</h1>
          <p className="text-sm text-stone-500">
            To sync your data to this device, generate a sync link from My Papers on your other device and open it here.
          </p>
          <Link
            href="/my-papers"
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-full transition-colors no-underline"
          >
            Go to My Papers
          </Link>
        </div>
      )}
    </div>
  );
}
