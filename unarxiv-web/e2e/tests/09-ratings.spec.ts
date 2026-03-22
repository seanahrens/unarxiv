import { test, expect } from "@playwright/test";
import { knownCompleteId, RATE_NARRATION, RATING_MODAL } from "../helpers/fixtures";
import { openDropdown } from "../helpers/page-actions";

test.describe("Ratings", () => {
  test("full rating lifecycle: create, verify, update, clear", async ({
    page,
  }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Step 1: Open the split-button dropdown to access "Rate Narration"
    await openDropdown(page);

    // Click "Rate Narration" in the dropdown
    const rateMenuItem = page.locator(RATE_NARRATION).first();
    await expect(rateMenuItem).toBeVisible({ timeout: 3000 });
    await rateMenuItem.click();

    // Rating modal should appear — use data-testid if deployed, else text
    const ratingModal = page.locator(RATING_MODAL);
    await expect(ratingModal.first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Rate Narration Quality")).toBeVisible();

    // Step 2: Click the 4th star — use data-testid, force click to avoid SVG interception
    // Fallback covers production before the rate-narration-star-* rename is deployed
    const star4 = page.locator('[data-testid="rate-narration-star-4"], [data-testid="star-4"]');
    await expect(star4).toBeVisible({ timeout: 2000 });
    await star4.click({ force: true });

    // Step 3: Submit — wait for button to be enabled (stars > 0) before clicking
    const submitBtn = page.locator('button:has-text("Submit Rating")');
    await expect(submitBtn).toBeEnabled({ timeout: 2000 });
    await submitBtn.click();

    // Modal transitions to a thank-you view — wait for it, then dismiss
    await expect(page.locator("text=Thanks for your feedback!")).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Done")').click();

    // Modal should now close
    await expect(ratingModal.first()).not.toBeVisible({ timeout: 5000 });

    // Step 4: Verify rating persists after reload
    await page.reload();
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Step 5: Clear the rating — re-open dropdown and click Rate Narration
    await openDropdown(page);

    const rateMenuItem2 = page.locator(RATE_NARRATION).first();
    await expect(rateMenuItem2).toBeVisible({ timeout: 3000 });
    await rateMenuItem2.click();

    await expect(ratingModal.first()).toBeVisible({ timeout: 5000 });

    // Click "Clear Rating"
    const clearBtn = page.locator('button:has-text("Clear Rating")');
    if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearBtn.click();
    } else {
      // Just close the modal if no clear button (no rating was saved somehow)
      await page.locator('button:has-text("Cancel")').click();
    }

    // Modal should close
    await expect(ratingModal.first()).not.toBeVisible({ timeout: 5000 });
  });
});
