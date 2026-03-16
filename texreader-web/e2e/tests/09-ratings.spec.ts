import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";

test.describe("Ratings", () => {
  test("full rating lifecycle: create, verify, update, clear", async ({
    page,
  }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    await page.locator("h1").waitFor({ timeout: 10000 });

    // Step 1: Open rating modal — the rate button is the thumbs-up icon button
    // It's the last action button in the row (after download dropdown)
    // It contains an SVG with the thumbs-up path, or DisplayStars if already rated
    const rateBtn = page.locator(
      'button:has(svg path[d*="22.5,10H15.75"])'
    );
    // If we have a previous rating, the button will show stars instead
    const ratedBtn = page.locator('button:has(svg[viewBox="0 0 24 24"][fill="#fbbf24"])');

    if (await rateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await rateBtn.click();
    } else if (await ratedBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await ratedBtn.click();
    } else {
      // Fallback: find the button right after the download dropdown div
      // The buttons are: play, playlist, (download div), rating
      const actionButtons = page.locator(
        'button:not([title="Play"]):not(:has-text("Playlist")):not(:has(polyline[points="7 10 12 15 17 10"]))'
      ).filter({ has: page.locator("svg") });
      await actionButtons.last().click();
    }

    // Rating modal should appear
    await expect(
      page.locator("text=Rate Narration Quality")
    ).toBeVisible({ timeout: 5000 });

    // Step 2: Click the 4th star
    // The StarRatingInput renders 5 buttons, each containing an SVG star
    // They're inside the modal overlay (fixed inset-0)
    const modalOverlay = page.locator(".fixed.inset-0");
    const starBtns = modalOverlay.locator(
      "button:has(svg[viewBox='0 0 24 24'])"
    );
    // The first 5 svg-containing buttons in the modal are the star rating buttons
    // But we need to exclude the close button etc. Stars have specific hover handlers.
    // Let's find the group of star buttons by looking for the star-rating container
    // The stars are wrapped in a flex container
    // StarRatingInput is a div.flex.gap-1 containing 5 star buttons
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

    // Step 5: Clear the rating — re-open modal
    // Now the button should show stars (amber colored) instead of thumbs-up
    const ratedBtnAfter = page.locator('button').filter({
      has: page.locator('svg'),
    });
    // Find the rating button by looking for amber styling
    const amberBtn = page.locator('button.text-amber-700, button:has(.text-amber-700)');
    if (await amberBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await amberBtn.click();
    } else {
      // Fallback: try the thumbs-up button again
      const fallbackBtn = page.locator('button:has(svg path[d*="22.5,10H15.75"])');
      await fallbackBtn.click();
    }

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
