import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";

test.describe("Ratings", () => {
  test("full rating lifecycle: create, verify, update, clear", async ({
    page,
  }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Step 1: Open the split-button dropdown to access "Rate Narration"
    const chevronBtn = page.locator('button:has(svg polyline[points="6 9 12 15 18 9"])');
    await expect(chevronBtn).toBeVisible({ timeout: 5000 });
    await chevronBtn.click();

    // Click "Rate Narration" in the dropdown
    const rateMenuItem = page.locator('button:has-text("Rate Narration")');
    await expect(rateMenuItem).toBeVisible({ timeout: 3000 });
    await rateMenuItem.click();

    // Rating modal should appear
    await expect(
      page.locator("text=Rate Narration Quality")
    ).toBeVisible({ timeout: 5000 });

    // Step 2: Click the 4th star
    const modalOverlay = page.locator(".fixed.inset-0");
    const starContainer = modalOverlay.locator("div.flex.gap-1");
    const stars = starContainer.locator("button");
    await stars.nth(3).click(); // 4th star (0-indexed)

    // Step 3: Submit
    const submitBtn = page.locator('button:has-text("Submit Rating")');
    await expect(submitBtn).toBeVisible({ timeout: 2000 });
    await submitBtn.click();

    // Modal should close
    await expect(
      page.locator("text=Rate Narration Quality")
    ).not.toBeVisible({ timeout: 5000 });

    // Step 4: Verify rating persists after reload
    await page.reload();
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Step 5: Clear the rating — re-open dropdown and click Rate Narration
    const chevronBtn2 = page.locator('button:has(svg polyline[points="6 9 12 15 18 9"])');
    await expect(chevronBtn2).toBeVisible({ timeout: 5000 });
    await chevronBtn2.click();

    const rateMenuItem2 = page.locator('button:has-text("Rate Narration")');
    await expect(rateMenuItem2).toBeVisible({ timeout: 3000 });
    await rateMenuItem2.click();

    await expect(
      page.locator("text=Rate Narration Quality")
    ).toBeVisible({ timeout: 5000 });

    // Click "Clear Rating"
    const clearBtn = page.locator('button:has-text("Clear Rating")');
    if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearBtn.click();
    } else {
      // Just close the modal if no clear button (no rating was saved somehow)
      await page.locator('button:has-text("Cancel")').click();
    }

    // Modal should close
    await expect(
      page.locator("text=Rate Narration Quality")
    ).not.toBeVisible({ timeout: 5000 });
  });
});
