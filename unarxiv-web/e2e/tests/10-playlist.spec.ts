import { test, expect } from "@playwright/test";
import { knownCompleteId, ADD_TO_PLAYLIST, REMOVE_FROM_PLAYLIST } from "../helpers/fixtures";
import { openDropdown } from "../helpers/page-actions";

test.describe("Playlist", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test — navigate to the domain first so storage is accessible
    await page.goto(`/p?id=${knownCompleteId()}`);
    await page.evaluate(() => localStorage.clear());
  });

  test("add to playlist via dropdown menu", async ({ page }) => {
    const id = knownCompleteId();
    // Page is already loaded from beforeEach; reload after clear to get fresh state
    await page.reload();
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

    // Pre-populate playlist via localStorage (already on the paper page from beforeEach)
    await page.evaluate(
      (paperId) => {
        const entry = { paperId, addedAt: new Date().toISOString() };
        localStorage.setItem("playlist", JSON.stringify([entry]));
      },
      id
    );

    await page.reload();
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

  test("playlist page shows added paper on /my-papers", async ({ page }) => {
    const id = knownCompleteId();
    // Paper page is already loaded from beforeEach
    await page.reload();
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Add to playlist via dropdown
    await openDropdown(page);
    const addBtn = page.locator(ADD_TO_PLAYLIST).first();
    await expect(addBtn).toBeVisible({ timeout: 3000 });
    await addBtn.click();

    // Navigate to my-papers and verify paper appears in playlist
    await page.goto("/my-papers");
    await expect(page.locator("h1:has-text('My Collections')")).toBeVisible({ timeout: 10000 });
    // A link to the paper should be visible (playlist section)
    await expect(page.locator(`a[href*="${id}"]`).first()).toBeVisible({ timeout: 5000 });
  });

  test("playlist state persists across page reload", async ({ page }) => {
    const id = knownCompleteId();
    await page.reload();
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Add to playlist
    await openDropdown(page);
    const addBtn = page.locator(ADD_TO_PLAYLIST).first();
    await expect(addBtn).toBeVisible({ timeout: 3000 });
    await addBtn.click();

    // Reload the page
    await page.reload();
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Dropdown should still show "In Playlist" after reload
    await openDropdown(page);
    const inPlaylistBtn = page.locator(REMOVE_FROM_PLAYLIST).first();
    await expect(inPlaylistBtn).toBeVisible({ timeout: 3000 });
  });
});
