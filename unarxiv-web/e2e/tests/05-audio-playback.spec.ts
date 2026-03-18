import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";
import { startAudioPlayback } from "../helpers/page-actions";

test.describe("Audio Playback", () => {
  test("play button starts audio on complete paper", async ({ page }) => {
    const id = knownCompleteId();
    await startAudioPlayback(page, id);

    const isPaused = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.paused
    );
    expect(isPaused).toBe(false);
  });

  test("audio element has correct src", async ({ page }) => {
    const id = knownCompleteId();
    await startAudioPlayback(page, id);

    const src = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.src
    );
    expect(src).toContain(`/api/papers/${id}/audio`);
  });
});
