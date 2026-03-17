import { test, expect } from "@playwright/test";
import { knownCompleteId, API_BASE } from "../helpers/fixtures";
import { openDropdown } from "../helpers/page-actions";

test.describe("Downloads", () => {
  test("download dropdown shows PDF and audio options", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Open the split-button dropdown (chevron button next to Play)
    await openDropdown(page);

    // Dropdown should show both download options
    await expect(page.locator("text=Download PDF")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=Download Audio")).toBeVisible({ timeout: 3000 });
  });

  test("MP3 download request returns valid response", async () => {
    const id = knownCompleteId();
    // Use GET with range header instead of HEAD (some workers don't handle HEAD)
    const res = await fetch(`${API_BASE}/api/papers/${id}/audio`, {
      headers: { Range: "bytes=0-0" },
    });
    // Should return 200 or 206 (partial content)
    expect([200, 206]).toContain(res.status);
  });
});
