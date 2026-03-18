import { test, expect } from "@playwright/test";
import { PAPER_CARD } from "../helpers/fixtures";

test.describe("Homepage", () => {
  test("homepage loads and shows paper cards", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(PAPER_CARD);
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("clicking a paper card navigates to paper page", async ({ page }) => {
    await page.goto("/");
    const firstCard = page.locator(PAPER_CARD).first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    await expect(page).toHaveURL(/\/p\??id=/);
    // Paper page should show a title
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10000 });
    const title = await heading.textContent();
    expect(title?.trim().length).toBeGreaterThan(0);
  });
});
