"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mergeTokensApi } from "@/lib/api";
import { mergeUpgradeDataFromSync } from "@/lib/upgradeKeys";

export default function SyncPage() {
  const [status, setStatus] = useState<"loading" | "imported" | "empty">("loading");

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
          } catch {}

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
      }

      // Merge list_tokens if present (for collection ownership)
      if (data.list_tokens && typeof data.list_tokens === "object" && !Array.isArray(data.list_tokens)) {
        const existing = (() => {
          try { return JSON.parse(localStorage.getItem("list_tokens") || "{}"); } catch { return {}; }
        })();
        const merged = { ...existing, ...(data.list_tokens as Record<string, unknown>) };
        localStorage.setItem("list_tokens", JSON.stringify(merged));
      }

      // Merge upgrade keys if present (support both old and new key names)
      if (data.upgrade_keys) {
        mergeUpgradeDataFromSync(data.upgrade_keys);
      } else if (data.premium_keys) {
        mergeUpgradeDataFromSync(data.premium_keys);
      }

      setStatus("imported");

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
            This device is now linked to your account. Your playlist, collections, ratings, and playback progress will stay in sync.
          </p>
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
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-stone-700 bg-surface border border-stone-300 hover:bg-stone-50 rounded-full transition-colors no-underline"
          >
            Go to My Papers
          </Link>
        </div>
      )}
    </div>
  );
}
