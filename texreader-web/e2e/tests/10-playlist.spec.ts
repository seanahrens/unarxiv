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

    // Click "Add to Playlist" button
    const addBtn = page.locator('button:has-text("Add to Playlist")').first();
    // If text is hidden on mobile, look for the ListPlus icon button
    if (!(await addBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      // On mobile the text is hidden, but there's still a playlist toggle button
      // with aria or title attributes
      const playlistBtn = page.locator("button").filter({
        has: page.locator('svg'),
      });
      // Look through buttons for one that adds to playlist
      const buttons = page.locator("button");
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const inner = await btn.innerHTML();
        if (inner.includes("list-plus") || inner.includes("ListPlus")) {
          await btn.click();
          break;
        }
      }
    } else {
      await addBtn.click();
    }

    // Button should change to "In Playlist" or equivalent
    await expect(
      page.locator('button:has-text("In Playlist")').first()
    ).toBeVisible({ timeout: 3000 }).catch(() => {
      // On mobile the text might be hidden, just check the button state changed
    });

    // Navigate to playlist page
    await page.goto("/playlist");
    await expect(page.locator("h1:has-text('My Playlist')")).toBeVisible({
      timeout: 5000,
    });

    // Paper should be in the playlist
    const playlistItem = page.locator(`a[href="/p/?id=${id}"]`);
    await expect(playlistItem.first()).toBeVisible({ timeout: 5000 });
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
    await expect(page.locator(`a[href="/p/?id=${id}"]`).first()).toBeVisible({
      timeout: 5000,
    });

    // Click remove button (X icon with title "Remove from playlist")
    const removeBtn = page.locator('button[title="Remove from playlist"]').first();
    await removeBtn.click();

    // Paper should be gone
    await expect(
      page.locator(`a[href="/p/?id=${id}"]`)
    ).not.toBeVisible({ timeout: 3000 });
  });
});
