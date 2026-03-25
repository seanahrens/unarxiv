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
 * Shared selector for "In Playlist" / remove from playlist menu item.
 */
export const REMOVE_FROM_PLAYLIST = '[data-testid="remove-from-playlist"], button:has-text("In Playlist")';

/**
 * Shared selector for "Rate Narration" menu item.
 */
export const RATE_NARRATION = '[data-testid="rate-narration"], button:has-text("Rate Narration")';

/**
 * Shared selector for "Download PDF" menu item.
 */
export const DOWNLOAD_PDF = '[data-testid="download-pdf"], button:has-text("Download PDF")';

/**
 * Shared selector for "Download Audio" menu item.
 */
export const DOWNLOAD_AUDIO = '[data-testid="download-audio"], button:has-text("Download Audio")';

/**
 * Shared selector for the rating modal overlay.
 * Prefers data-testid; falls back to div.fixed.inset-0 (the overlay div) for pre-deploy runs.
 */
export const RATING_MODAL = '[data-testid="rating-modal"], div.fixed.inset-0';

/**
 * Shared selector for the "Newly Added" navigation button in BrowseLayout.
 * Works on current production (no data-testid) AND after deployment.
 */
export const NEWLY_ADDED_NAV =
  '[data-testid="newly-added-nav"], button:has-text("Newly Added")';

/**
 * Shared selector for the admin dashboard content area (shown after auth).
 * Works on current production (no data-testid) AND after deployment.
 */
export const ADMIN_DASHBOARD =
  '[data-testid="admin-dashboard"], h2:has-text("Top Contributors")';

/**
 * Shared selector for the "Generate Narration" / "Narrate" button.
 * The button text is "Narrate" (or "Retry" for failed); the old label
 * "Generate Audio Narration" no longer exists in the UI.
 */
export const GENERATE_NARRATION =
  '[data-testid="generate-narration"], button:has-text("Narrate"), button:has-text("Retry")';

/**
 * Shared selector for the rating submit button.
 */
export const SUBMIT_RATING =
  '[data-testid="submit-rating"], button:has-text("Submit Rating"), button:has-text("Update Rating")';

/**
 * Shared selector for the rating "Done" button (post-submit view).
 */
export const DONE_RATING =
  '[data-testid="done-rating"], button:has-text("Done")';

/**
 * Shared selector for the rating "Cancel" button.
 */
export const CANCEL_RATING =
  '[data-testid="cancel-rating"], button:has-text("Cancel")';

/**
 * Shared selector for the rating "Clear Rating" button.
 */
export const CLEAR_RATING =
  '[data-testid="clear-rating"], button:has-text("Clear Rating")';

/**
 * Shared selector for the admin password form continue button.
 */
export const ADMIN_CONTINUE =
  '[data-testid="admin-continue"], button:has-text("Continue")';

/**
 * Shared selector for the "Link Profile to Another Device" button on /my-papers.
 */
export const LINK_TO_ANOTHER_DEVICE =
  '[data-testid="link-to-another-device"], button:has-text("Link Profile to Another Device")';

/**
 * Shared selector for the paper error state (paper not found / load error).
 * Prefers data-testid; falls back to .text-red-600 for pre-deploy runs.
 */
export const PAPER_ERROR =
  '[data-testid="paper-error"], .text-red-600';

/** Discovered in global-setup.ts and written to env */
export function knownCompleteId(): string {
  const id = process.env.KNOWN_COMPLETE_ID;
  if (!id) throw new Error("KNOWN_COMPLETE_ID not set — global setup failed");
  return id;
}
