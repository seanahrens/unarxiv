import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";
import { startAudioPlayback } from "../helpers/page-actions";

test.describe("Global Media Player", () => {
  // All tests in this suite need audio playing; startAudioPlayback handles navigation + play
  test.beforeEach(async ({ page }) => {
    await startAudioPlayback(page, knownCompleteId());
  });

  test("header player appears after starting playback", async ({ page }) => {
    // Header player should show speed button
    const speedBtn = page.locator('button:has-text("1x")').first();
    await expect(speedBtn).toBeVisible({ timeout: 5000 });
  });

  // Audio playback is unreliable in headless CI — these tests depend on
  // the audio element actually starting playback which requires network
  // streaming of an MP3 file. They pass locally but flake in CI.
  // Audio playback often fails in headless CI (no audio device, network streaming)
  test.fixme("pause and resume works", async ({ page }) => {
    test.slow(); // audio may take longer to start in headless CI
    // Find pause button in the header (title="Pause")
    const pauseBtn = page.locator('button[title="Pause"]').first();
    await expect(pauseBtn).toBeVisible({ timeout: 10000 });
    await pauseBtn.click();

    const paused = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.paused
    );
    expect(paused).toBe(true);

    // Resume — header play button has title="Play"
    const playBtn = page.locator('button[title="Play"]').first();
    await playBtn.click();
    const playing = await page.evaluate(
      () => !(document.querySelector("audio") as HTMLAudioElement)?.paused
    );
    expect(playing).toBe(true);
  });

  test.fixme("skip back decreases currentTime", async ({ page }) => {
    test.slow();
    // Seek to 30s first so skip back has room
    await page.evaluate(() => {
      (document.querySelector("audio") as HTMLAudioElement).currentTime = 30;
    });
    // Wait for seek to settle before reading currentTime
    await page.waitForFunction(
      () => (document.querySelector("audio") as HTMLAudioElement)?.currentTime >= 25,
      { timeout: 5000 }
    );

    const timeBefore = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.currentTime
    );

    const skipBack = page.locator('button[title="Back 10s"]').first();
    await skipBack.click();

    const timeAfter = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.currentTime
    );
    expect(timeAfter).toBeLessThan(timeBefore!);
  });

  test.fixme("skip forward increases currentTime", async ({ page }) => {
    test.slow();
    const timeBefore = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.currentTime
    );

    const skipFwd = page.locator('button[title="Forward 10s"]').first();
    await skipFwd.click();

    const timeAfter = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.currentTime
    );
    expect(timeAfter).toBeGreaterThan(timeBefore!);
  });

  test("speed button cycles playback rate", async ({ page }) => {
    const speedBtn = page.locator('button:has-text("1x")').first();
    await expect(speedBtn).toBeVisible();
    await speedBtn.click();

    // After clicking, should show 1.25x
    await expect(
      page.locator('button:has-text("1.25x")').first()
    ).toBeVisible({ timeout: 2000 });
  });

  test.fixme("paper link in header navigates to paper page", async ({ page }) => {
    test.slow();
    const id = knownCompleteId();
    // The header player has a link to the paper page
    const paperLink = page.locator(`a[href*="/p?id=${id}"]`).first();
    await expect(paperLink).toBeVisible({ timeout: 10000 });
    const href = await paperLink.getAttribute("href");
    expect(href).toContain(id);
  });
});
