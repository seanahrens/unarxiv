import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";
import { openDropdown } from "../helpers/page-actions";

test.describe("Playlist", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("add to playlist toggles button to In Playlist", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Open the split-button dropdown — should show "Add to Playlist"
    await openDropdown(page);
    const addBtn = page.locator('button:has-text("Add to Playlist")');
    await expect(addBtn).toBeVisible({ timeout: 3000 });
    await addBtn.click();

    // Reopen dropdown — should now show "In Playlist"
    await openDropdown(page);
    await expect(page.locator('button:has-text("In Playlist")')).toBeVisible({
      timeout: 3000,
    });
  });

  test("remove from playlist toggles button back to Add to Playlist", async ({
    page,
  }) => {
    const id = knownCompleteId();

    // Pre-populate playlist via localStorage
    await page.goto("/");
    await page.evaluate(
      (paperId) => {
        localStorage.setItem(
          "playlist",
          JSON.stringify([{ paperId, addedAt: new Date().toISOString() }])
        );
      },
      id
    );

    // Navigate to the paper page
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Open dropdown — should show "In Playlist"
    await openDropdown(page);
    const inPlaylistBtn = page.locator('button:has-text("In Playlist")');
    await expect(inPlaylistBtn).toBeVisible({ timeout: 3000 });

    // Click to remove
    await inPlaylistBtn.click();

    // Reopen dropdown — should show "Add to Playlist" again
    await openDropdown(page);
    await expect(
      page.locator('button:has-text("Add to Playlist")')
    ).toBeVisible({ timeout: 3000 });
  });
});
