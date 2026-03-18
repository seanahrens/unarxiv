import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";
import { openDropdown } from "../helpers/page-actions";

test.describe("Playlist", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  // Playlist UI moved to PlayerBar sidebar; my-papers page shows server-side additions only
  test.fixme("add to playlist and verify on playlist page", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Open the split-button dropdown
    await openDropdown(page);

    // Click "Add to Playlist" in the dropdown
    const addBtn = page.locator('button:has-text("Add to Playlist")');
    await expect(addBtn).toBeVisible({ timeout: 3000 });
    await addBtn.click();

    // Navigate to playlist page
    await page.goto("/my-papers");
    await expect(page.locator("h2:has-text('Papers I Added')")).toBeVisible({
      timeout: 5000,
    });

    // Wait for the paper to appear — Next.js adds trailing slash: /p?id=...
    const paperLink = page.locator(`a[href="/p?id=${id}"]`);
    await expect(paperLink.first()).toBeVisible({ timeout: 10000 });
  });

  // Playlist UI moved to PlayerBar sidebar; my-papers page shows server-side additions only
  test.fixme("remove from playlist", async ({ page }) => {
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

    await page.goto("/my-papers");

    // Wait for the paper link to appear (data loads async)
    // Next.js adds trailing slash: /p?id=...
    const paperLink = page.locator(`a[href="/p?id=${id}"]`).first();
    await expect(paperLink).toBeVisible({ timeout: 10000 });

    // Click remove button (X icon with title "Remove")
    const removeBtn = page.locator('button[title="Remove from site"]').first();
    await removeBtn.click();

    // Paper should be gone
    await expect(paperLink).not.toBeVisible({ timeout: 3000 });
  });
});
