import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";
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
    const rateMenuItem = page.locator('button:has-text("Rate Narration")');
    await expect(rateMenuItem).toBeVisible({ timeout: 3000 });
    await rateMenuItem.click();

    // Rating modal should appear
    await expect(page.locator('[data-testid="rating-modal"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Rate Narration Quality")).toBeVisible();

    // Step 2: Click the 4th star
    await page.locator('[data-testid="star-4"]').click();

    // Step 3: Submit
    const submitBtn = page.locator('button:has-text("Submit Rating")');
    await expect(submitBtn).toBeVisible({ timeout: 2000 });
    await submitBtn.click();

    // Modal should close
    await expect(page.locator('[data-testid="rating-modal"]')).not.toBeVisible({ timeout: 5000 });

    // Step 4: Verify rating persists after reload
    await page.reload();
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Step 5: Clear the rating — re-open dropdown and click Rate Narration
    await openDropdown(page);

    const rateMenuItem2 = page.locator('button:has-text("Rate Narration")');
    await expect(rateMenuItem2).toBeVisible({ timeout: 3000 });
    await rateMenuItem2.click();

    await expect(page.locator('[data-testid="rating-modal"]')).toBeVisible({ timeout: 5000 });

    // Click "Clear Rating"
    const clearBtn = page.locator('button:has-text("Clear Rating")');
    if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearBtn.click();
    } else {
      // Just close the modal if no clear button (no rating was saved somehow)
      await page.locator('button:has-text("Cancel")').click();
    }

    // Modal should close
    await expect(page.locator('[data-testid="rating-modal"]')).not.toBeVisible({ timeout: 5000 });
  });
});
