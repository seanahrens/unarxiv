import { test, expect } from "@playwright/test";
import { API_BASE, PAPER_CARD, NEWLY_ADDED_NAV } from "../helpers/fixtures";

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

  test("Newly Added navigation button is visible on homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(NEWLY_ADDED_NAV).first()).toBeVisible({ timeout: 10000 });
  });

  test("clicking Newly Added from a collection page navigates back to /", async ({
    page,
  }) => {
    // Create a temporary list so we have a valid collection URL to start from
    const res = await fetch(`${API_BASE}/api/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Cross-Route Test" }),
    });
    const { list, owner_token } = await res.json();

    try {
      // Navigate to the collection page (different route than /)
      await page.goto(`/l?id=${list.id}`);
      await page.locator("h1").waitFor({ timeout: 10000 });
      await expect(page).toHaveURL(/\/l/);

      // Click "Newly Added" — should navigate to / via router.push
      const newlyAddedBtn = page.locator(NEWLY_ADDED_NAV).first();
      await expect(newlyAddedBtn).toBeVisible({ timeout: 5000 });
      await newlyAddedBtn.click();

      // Should land on homepage
      await expect(page).toHaveURL(/^\/?$|^\/$/, { timeout: 10000 });
      // Papers should be visible on homepage
      await expect(page.locator(PAPER_CARD).first()).toBeVisible({ timeout: 10000 });
    } finally {
      await fetch(`${API_BASE}/api/lists/${list.id}`, {
        method: "DELETE",
        headers: { "X-List-Token": owner_token },
      });
    }
  });
});
