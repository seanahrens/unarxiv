import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";

test.describe("Playlist", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("add to playlist and verify on playlist page", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Open the split-button dropdown
    const chevronBtn = page.locator('button:has(svg polyline[points="6 9 12 15 18 9"])');
    await expect(chevronBtn).toBeVisible({ timeout: 5000 });
    await chevronBtn.click();

    // Click "Add to Playlist" in the dropdown
    const addBtn = page.locator('button:has-text("Add to Playlist")');
    await expect(addBtn).toBeVisible({ timeout: 3000 });
    await addBtn.click();

    // Navigate to playlist page
    await page.goto("/playlist");
    await expect(page.locator("h1:has-text('My Playlist')")).toBeVisible({
      timeout: 5000,
    });

    // Wait for the paper to appear — Next.js adds trailing slash: /p/?id=...
    const paperLink = page.locator(`a[href="/p/?id=${id}"]`);
    await expect(paperLink.first()).toBeVisible({ timeout: 10000 });
  });

  test("remove from playlist", async ({ page }) => {
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

    await page.goto("/playlist");

    // Wait for the paper link to appear (data loads async)
    // Next.js adds trailing slash: /p/?id=...
    const paperLink = page.locator(`a[href="/p/?id=${id}"]`).first();
    await expect(paperLink).toBeVisible({ timeout: 10000 });

    // Click remove button (X icon with title "Remove from playlist")
    const removeBtn = page.locator('button[title="Remove from playlist"]').first();
    await removeBtn.click();

    // Paper should be gone
    await expect(paperLink).not.toBeVisible({ timeout: 3000 });
  });
});
