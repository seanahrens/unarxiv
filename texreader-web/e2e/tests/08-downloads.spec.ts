import { test, expect } from "@playwright/test";
import { knownCompleteId, API_BASE } from "../helpers/fixtures";

test.describe("Downloads", () => {
  test("download dropdown shows PDF and MP3 options", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // The download button is icon-only (download arrow SVG + chevron SVG)
    // It's inside a div.relative, after the playlist button
    // Click the button that contains the download arrow SVG (polyline points="7 10 12 15 17 10")
    const downloadBtn = page.locator('button:has(svg polyline[points="7 10 12 15 17 10"])');
    await expect(downloadBtn).toBeVisible({ timeout: 5000 });
    await downloadBtn.click();

    // Dropdown should show both options
    await expect(page.locator("text=Download PDF")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("text=Download MP3")).toBeVisible({ timeout: 3000 });
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
