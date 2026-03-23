import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";
import { startAudioPlayback } from "../helpers/page-actions";

test.describe("Audio Playback", () => {
  // Both assertions only need one page load + audio start — batch them.
  test("play button starts audio and src points to API endpoint", async ({ page }) => {
    const id = knownCompleteId();
    await startAudioPlayback(page, id);

    const [isPaused, src] = await page.evaluate(() => {
      const el = document.querySelector("audio") as HTMLAudioElement;
      return [el?.paused, el?.src] as const;
    });

    expect(isPaused).toBe(false);
    expect(src).toContain(`/api/papers/${id}/audio`);
  });
});
