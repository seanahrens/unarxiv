import { test, expect } from "@playwright/test";
import { knownCompleteId, API_BASE } from "../helpers/fixtures";

test.describe("Transcript Viewer", () => {
  test("transcript page loads for a complete paper", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/s?id=${id}`);

    // Should show the paper title as h1
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10000 });
    const title = await heading.textContent();
    expect(title?.trim().length).toBeGreaterThan(0);

    // Should NOT show an error message
    await expect(page.locator("text=Script not available yet")).not.toBeVisible();
  });

  test("transcript API endpoint returns text content", async () => {
    const id = knownCompleteId();
    const res = await fetch(`${API_BASE}/api/papers/${id}/transcript`);
    expect([200, 206]).toContain(res.status);
    const contentType = res.headers.get("content-type") || "";
    expect(contentType).toMatch(/text/);
  });
});
