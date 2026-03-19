export const TEST_ARXIV_ID = "2602.21593";
export const API_BASE =
  process.env.TEST_API_URL || "https://api.unarxiv.org";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

/**
 * Shared selector for paper cards.
 * Works on current production (no data-testid) AND after deployment (with testid).
 */
export const PAPER_CARD =
  '[data-testid="paper-card"], a[href*="/p?id="]';

/**
 * Shared selector for the main search input.
 */
export const SEARCH_INPUT = '[data-testid="search-input"], input[type="text"]';

/**
 * Shared selector for the PlayerBar speed button.
 */
export const PLAYER_SPEED = '[data-testid="player-speed"], button[title="Speed"]';

/**
 * Shared selector for the PlayerBar play/pause button.
 */
export const PLAYER_PLAY_PAUSE = '[data-testid="player-play-pause"], button[title="Pause"], button[title="Play"]';

/**
 * Shared selector for "Add to Playlist" menu item.
 */
export const ADD_TO_PLAYLIST = '[data-testid="add-to-playlist"], button:has-text("Add to Playlist")';

/**
 * Shared selector for "Rate Narration" menu item.
 */
export const RATE_NARRATION = '[data-testid="rate-narration"], button:has-text("Rate Narration")';

/** Discovered in global-setup.ts and written to env */
export function knownCompleteId(): string {
  const id = process.env.KNOWN_COMPLETE_ID;
  if (!id) throw new Error("KNOWN_COMPLETE_ID not set — global setup failed");
  return id;
}
