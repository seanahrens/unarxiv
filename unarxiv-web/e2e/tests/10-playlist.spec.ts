import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";
import { openDropdown } from "../helpers/page-actions";

/**
 * Selectors — prefer data-testid (deployed), fall back to text for pre-deploy runs.
 */
const ADD_TO_PLAYLIST = '[data-testid="add-to-playlist"], button:has-text("Add to Playlist")';
const REMOVE_FROM_PLAYLIST = '[data-testid="remove-from-playlist"], button:has-text("In Playlist")';

test.describe("Playlist", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("add to playlist via dropdown menu", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Open the split-button dropdown
    await openDropdown(page);

    // Click "Add to Playlist" in the dropdown
    const addBtn = page.locator(ADD_TO_PLAYLIST).first();
    await expect(addBtn).toBeVisible({ timeout: 3000 });
    await addBtn.click();

    // After adding, re-open the menu — should now show "In Playlist"
    await openDropdown(page);
    const inPlaylistBtn = page.locator(REMOVE_FROM_PLAYLIST).first();
    await expect(inPlaylistBtn).toBeVisible({ timeout: 3000 });
  });

  test("remove from playlist via dropdown menu", async ({ page }) => {
    const id = knownCompleteId();

    // Pre-populate playlist via localStorage so we don't need to add first
    await page.goto("/");
    await page.evaluate(
      (paperId) => {
        const entry = { paperId, addedAt: new Date().toISOString() };
        localStorage.setItem("playlist", JSON.stringify([entry]));
      },
      id
    );

    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Open the dropdown — should show "In Playlist"
    await openDropdown(page);
    const inPlaylistBtn = page.locator(REMOVE_FROM_PLAYLIST).first();
    await expect(inPlaylistBtn).toBeVisible({ timeout: 3000 });

    // Click to remove
    await inPlaylistBtn.click();

    // Re-open dropdown — should show "Add to Playlist" again
    await openDropdown(page);
    const addBtn = page.locator(ADD_TO_PLAYLIST).first();
    await expect(addBtn).toBeVisible({ timeout: 3000 });
  });
});
