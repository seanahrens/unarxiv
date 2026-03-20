import posthog from "posthog-js";
import { getUserToken } from "./userToken";

let initialized = false;

// ── Event type map ─────────────────────────────────────────────────────
// Single source of truth for every custom event and its properties.
// Components call track() with a typed event name — never import posthog.

type AnalyticsEvents = {
  search: {
    query: string;
    result_count: number;
    has_arxiv_id: boolean;
  };
  paper_viewed: {
    arxiv_id: string;
    source: "search" | "collection" | "direct";
  };
  narration_requested: {
    arxiv_id: string;
    is_retry: boolean;
  };
  paper_imported: {
    arxiv_id: string;
    source: "search" | "url_paste";
  };
  playback_started: {
    arxiv_id: string;
    duration_seconds: number;
  };
  playback_paused: {
    arxiv_id: string;
    position_seconds: number;
    duration_seconds: number;
  };
  playback_completed: {
    arxiv_id: string;
    duration_seconds: number;
    playback_rate: number;
  };
  playback_progress: {
    arxiv_id: string;
    percent: 25 | 50 | 75;
    seconds_listened: number;
  };
  playback_speed_changed: {
    speed: number;
    arxiv_id: string;
  };
  playlist_modified: {
    action: "add" | "remove" | "reorder";
    arxiv_id?: string;
    playlist_size: number;
  };
  collection_created: {
    is_public: boolean;
    paper_count: number;
  };
  collection_modified: {
    action: "add_paper" | "remove_paper";
    list_id: string;
  };
  download: {
    arxiv_id: string;
    file_type: "mp3" | "pdf";
  };
  rating_submitted: {
    arxiv_id: string;
    stars: number;
    has_comment: boolean;
  };
};

// ── Public API ─────────────────────────────────────────────────────────

export function init(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return; // silent no-op when key is not configured

  posthog.init(apiKey, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage",
    loaded: (ph) => {
      const token = getUserToken();
      if (token) ph.identify(token);
    },
  });

  initialized = true;
}

export function track<E extends keyof AnalyticsEvents>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function identify(userId: string): void {
  if (!initialized) return;
  posthog.identify(userId);
}
