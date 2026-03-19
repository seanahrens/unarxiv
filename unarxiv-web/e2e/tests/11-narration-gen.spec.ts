import { test, expect } from "@playwright/test";
import { cleanupTestPaper, getPaper } from "../helpers/api";
import { TEST_ARXIV_ID, API_BASE, SEARCH_INPUT } from "../helpers/fixtures";

// This test is slow (~2 min) and excluded from the "fast" project
test.describe("Narration Generation", () => {
  test.setTimeout(180_000); // 3 minute timeout

  test.beforeAll(async () => {
    await cleanupTestPaper(TEST_ARXIV_ID).catch(() => {});
  });

  test.afterAll(async () => {
    await cleanupTestPaper(TEST_ARXIV_ID).catch(() => {});
  });

  test("full narration lifecycle: import, generate, verify audio", async ({
    page,
  }) => {
    // Step 1: Import the paper via search
    await page.goto("/");
    const searchInput = page.locator(SEARCH_INPUT).first();
    await searchInput.fill(TEST_ARXIV_ID);
    await expect(page).toHaveURL(new RegExp(`/p\\??id=${TEST_ARXIV_ID}`), {
      timeout: 15000,
    });

    // Step 2: Wait for paper page to load
    await page.locator("h1").waitFor({ timeout: 15000 });

    // Step 3: Click "Generate Audio Narration"
    const genBtn = page
      .locator('button:has-text("Generate Audio Narration")')
      .first();
    await expect(genBtn).toBeVisible({ timeout: 5000 });
    await genBtn.click();

    // Step 4: Wait for status to change (button may disappear or show progress)
    // The page shows a progress tracker when status changes from not_requested
    await expect(genBtn).not.toBeVisible({ timeout: 15000 });

    // Step 5: Poll API until complete (up to 2.5 minutes)
    let paper = null;
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      paper = await getPaper(TEST_ARXIV_ID);
      if (paper?.status === "complete") break;
      if (paper?.status === "failed") {
        throw new Error(`Narration failed: ${paper.error_message}`);
      }
      await new Promise((r) => setTimeout(r, 5000)); // Poll every 5s
    }
    expect(paper?.status).toBe("complete");

    // Step 6: Verify audio is accessible (use Range GET since Worker doesn't handle HEAD)
    const res = await fetch(`${API_BASE}/api/papers/${TEST_ARXIV_ID}/audio`, {
      headers: { Range: "bytes=0-0" },
    });
    expect([200, 206]).toContain(res.status);
  });
});
