import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Open the split-button dropdown on the paper page.
 * Prefers data-testid="split-button-chevron"; falls back to SVG-path selector
 * for runs against production before the frontend is deployed.
 */
export async function openDropdown(page: Page): Promise<void> {
  const chevron = page.locator(
    '[data-testid="split-button-chevron"], button:has(svg polyline[points="6 9 12 15 18 9"])'
  );
  await expect(chevron).toBeVisible({ timeout: 5000 });
  await chevron.click();
}

/** Navigate to a complete paper and start audio playback. */
export async function startAudioPlayback(page: Page, id: string): Promise<void> {
  await page.goto(`/p?id=${id}`);
  const playBtn = page.locator('button:has-text("Play")').first();
  await expect(playBtn).toBeVisible({ timeout: 10000 });
  await playBtn.click();
  await page.waitForFunction(
    () => !(document.querySelector("audio") as HTMLAudioElement)?.paused,
    { timeout: 10000 }
  );
}
