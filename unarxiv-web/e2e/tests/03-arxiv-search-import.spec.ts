import { test, expect } from "@playwright/test";
import { cleanupTestPaper, getPaper } from "../helpers/api";
import { TEST_ARXIV_ID, SEARCH_INPUT } from "../helpers/fixtures";

// These tests MUST run in order since each depends on the previous
test.describe.serial("ArXiv Search Import", () => {
  test.beforeAll(async () => {
    await cleanupTestPaper(TEST_ARXIV_ID).catch(() => {});
  });

  test.afterAll(async () => {
    await cleanupTestPaper(TEST_ARXIV_ID).catch(() => {});
  });

  test("typing arXiv ID in search imports paper", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator(SEARCH_INPUT).first();
    await searchInput.fill(TEST_ARXIV_ID);

    // Should detect arXiv ID and redirect to paper page
    await expect(page).toHaveURL(new RegExp(`/p/\\?id=${TEST_ARXIV_ID}`), {
      timeout: 15000,
    });

    // Wait for the paper page to fully load (auto-import completes)
    await page.locator("h1").waitFor({ timeout: 15000 });
  });

  test("imported paper shows title and content", async ({ page }) => {
    await page.goto(`/p?id=${TEST_ARXIV_ID}`);
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 15000 });
    const title = await heading.textContent();
    expect(title?.trim().length).toBeGreaterThan(0);

    // Verify the paper ID is shown on the page
    await expect(page.locator(`text=${TEST_ARXIV_ID}`).first()).toBeVisible();
  });

  test("imported paper has status not_requested via API", async () => {
    const paper = await getPaper(TEST_ARXIV_ID);
    expect(paper).not.toBeNull();
    expect(paper.status).toBe("not_requested");
  });

  test("My Additions section is visible on playlist page", async ({ page }) => {
    await page.goto("/my-papers");

    // "Papers I Added" section should always be visible
    await expect(page.locator("h2:has-text('Papers I Added')")).toBeVisible({
      timeout: 10000,
    });
  });

  test("admin delete removes test paper", async () => {
    test.skip(!process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD env not set");
    await cleanupTestPaper(TEST_ARXIV_ID);
    const paper = await getPaper(TEST_ARXIV_ID);
    expect(paper).toBeNull();
  });
});
