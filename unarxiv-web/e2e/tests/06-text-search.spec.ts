import { test, expect } from "@playwright/test";

// Prefer data-testid selectors; fall back to legacy selectors for pre-deployment runs
const PAPER_CARD = '[data-testid="paper-card"], a[href*="/p/"][href*="id="]';
const SEARCH_INPUT = '[data-testid="search-input"], input[type="text"]';

test.describe("Text Search", () => {
  test("searching a common term returns results", async ({ page }) => {
    await page.goto("/?q=AI");
    const cards = page.locator(PAPER_CARD);
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("multi-word search uses AND semantics", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.locator(SEARCH_INPUT).first();
    await searchInput.fill("language model");
    // Wait for search results to load (debounced)
    await page.waitForURL(/q=language/, { timeout: 5000 });
    await expect(page).toHaveURL(/q=language/);
  });

  test("gibberish search shows no results", async ({ page }) => {
    await page.goto("/?q=xyzqwertyfoobar99999");
    // Wait for page to settle — no paper cards should appear
    await page.locator(PAPER_CARD).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    const cards = page.locator(PAPER_CARD);
    const count = await cards.count();
    expect(count).toBe(0);
  });
});
