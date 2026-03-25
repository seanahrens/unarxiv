import { test, expect } from "@playwright/test";
import { cleanupTestPaper } from "../helpers/api";
import { TEST_ARXIV_ID, PAPER_ERROR } from "../helpers/fixtures";

test.describe("ArXiv URL Routes", () => {
  test.afterAll(async () => {
    // Clean up in case auto-import created the paper
    await cleanupTestPaper(TEST_ARXIV_ID).catch(() => {});
  });

  test("/abs/ route redirects to paper page", async ({ page }) => {
    await page.goto(`/abs/${TEST_ARXIV_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(new RegExp(`/p\\??id=${TEST_ARXIV_ID}`));
  });

  test("/html/ route redirects to paper page", async ({ page }) => {
    await page.goto(`/html/${TEST_ARXIV_ID}`, {
      waitUntil: "domcontentloaded",
    });
    // Should redirect through /abs/ to /p?id=
    await expect(page).toHaveURL(new RegExp(`/p\\??id=${TEST_ARXIV_ID}`));
  });

  test("/pdf/ route redirects to paper page", async ({ page }) => {
    await page.goto(`/pdf/${TEST_ARXIV_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(new RegExp(`/p\\??id=${TEST_ARXIV_ID}`));
  });

  test("paper page renders with title after redirect", async ({ page }) => {
    await page.goto(`/abs/${TEST_ARXIV_ID}`);
    // Wait for paper page to load and show title
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 15000 });
    const title = await heading.textContent();
    expect(title?.trim().length).toBeGreaterThan(0);
  });

  test("invalid paper ID shows error state", async ({ page }) => {
    await page.goto("/p?id=totally-invalid-id-xyz999");
    // Should show an error message, not a blank page or spinner
    const errorMsg = page.locator(PAPER_ERROR).first();
    await expect(errorMsg).toBeVisible({ timeout: 10000 });
    const text = await errorMsg.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });
});
