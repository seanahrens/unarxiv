import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";

test.describe("Audio Playback", () => {
  test("play button starts audio on complete paper", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);

    // Find the play button (round black button with title "Play")
    const playBtn = page.locator('button[title="Play"]').first();
    await expect(playBtn).toBeVisible({ timeout: 10000 });
    await playBtn.click();

    // Wait for audio to actually start (may take a moment to load)
    await page.waitForFunction(
      () => {
        const audio = document.querySelector("audio") as HTMLAudioElement;
        return audio && !audio.paused;
      },
      { timeout: 10000 }
    );

    const isPaused = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.paused
    );
    expect(isPaused).toBe(false);
  });

  test("audio element has correct src", async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);

    const playBtn = page.locator('button[title="Play"]').first();
    await expect(playBtn).toBeVisible({ timeout: 10000 });
    await playBtn.click();

    const src = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.src
    );
    expect(src).toContain(`/api/papers/${id}/audio`);
  });
});
