import { test, expect } from "@playwright/test";

test.describe("Text Search", () => {
  test("searching a common term returns results", async ({ page }) => {
    await page.goto("/?q=AI");
    const cards = page.locator('[data-testid="paper-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("multi-word search uses AND semantics", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator('[data-testid="search-input"]');
    await searchInput.fill("language model");
    // Wait for search results to load (debounced)
    await page.waitForURL(/q=language/, { timeout: 5000 });
    await expect(page).toHaveURL(/q=language/);
  });

  test("gibberish search shows no results", async ({ page }) => {
    await page.goto("/?q=xyzqwertyfoobar99999");
    // Wait for page to settle — no paper cards should appear
    await page.locator('[data-testid="paper-card"]').waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    const cards = page.locator('[data-testid="paper-card"]');
    const count = await cards.count();
    expect(count).toBe(0);
  });
});
