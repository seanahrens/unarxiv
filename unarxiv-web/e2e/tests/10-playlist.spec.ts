import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";
import { openDropdown } from "../helpers/page-actions";

// Playlist selector — works before and after add-to-playlist testid is deployed
const ADD_TO_PLAYLIST =
  '[data-testid="add-to-playlist"], button:has-text("Add to Playlist"), button:has-text("In Playlist")';

test.describe("Playlist", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh each test
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("Add to Playlist option appears in paper actions dropdown", async ({
    page,
  }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    await openDropdown(page);

    const playlistItem = page.locator(ADD_TO_PLAYLIST).first();
    await expect(playlistItem).toBeVisible({ timeout: 3000 });
  });

  // The playlist popup lives inside the PlayerBar which only renders when audio
  // is actively playing. Audio streaming in headless CI is unreliable, so these
  // tests are marked fixme. Run locally with --headed to verify.
  test.fixme(
    "clicking Add to Playlist stores paper in localStorage playlist",
    async ({ page }) => {
      const id = knownCompleteId();
      await page.goto(`/p?id=${id}`);
      await page.locator("h1").waitFor({ timeout: 10000 });

      await openDropdown(page);

      const addBtn = page.locator(ADD_TO_PLAYLIST).first();
      await expect(addBtn).toBeVisible({ timeout: 3000 });
      await addBtn.click();

      // Verify localStorage was updated
      const playlist = await page.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem("playlist") || "[]");
        } catch {
          return [];
        }
      });
      expect(playlist.some((e: any) => e.paperId === id)).toBe(true);
    }
  );

  test.fixme(
    "playlist popup shows added paper after audio starts playing",
    async ({ page }) => {
      const id = knownCompleteId();

      // Pre-populate playlist via localStorage (avoids needing to click Add)
      await page.goto("/");
      await page.evaluate((paperId) => {
        localStorage.setItem(
          "playlist",
          JSON.stringify([{ paperId, addedAt: new Date().toISOString() }])
        );
      }, id);

      // Start audio playback to make the PlayerBar appear
      await page.goto(`/p?id=${id}`);
      const playBtn = page.locator('button:has-text("Play")').first();
      await expect(playBtn).toBeVisible({ timeout: 10000 });
      await playBtn.click();
      await page.waitForFunction(
        () => !(document.querySelector("audio") as HTMLAudioElement)?.paused,
        { timeout: 10000 }
      );

      // Open playlist popup via the PlayerBar playlist button
      const playlistToggle = page.locator(
        '#player-playlist-button, button[title="Toggle playlist"]'
      );
      await expect(playlistToggle).toBeVisible({ timeout: 5000 });
      await playlistToggle.click();

      // Playlist popup should appear with "My Playlist" heading
      await expect(
        page.locator('h3:has-text("My Playlist")')
      ).toBeVisible({ timeout: 3000 });

      // The pre-populated paper should appear in the list (not "empty" state)
      await expect(
        page.locator("text=Your playlist is empty.")
      ).not.toBeVisible();
    }
  );
});
