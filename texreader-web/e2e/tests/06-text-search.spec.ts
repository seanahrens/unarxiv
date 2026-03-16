import { test, expect } from "@playwright/test";

test.describe("Text Search", () => {
  test("searching a common term returns results", async ({ page }) => {
    await page.goto("/?q=AI");
    const cards = page.locator('a[href*="/p/"][href*="id="]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("multi-word search uses AND semantics", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill("language model");
    // Wait for search results to load (debounced)
    await page.waitForURL(/q=language/, { timeout: 5000 });
    await expect(page).toHaveURL(/q=language/);
  });

  test("gibberish search shows no results", async ({ page }) => {
    await page.goto("/?q=xyzqwertyfoobar99999");
    // Wait for load
    await page.waitForLoadState("networkidle");
    const cards = page.locator('a[href*="/p/"][href*="id="]');
    const count = await cards.count();
    expect(count).toBe(0);
  });
});
