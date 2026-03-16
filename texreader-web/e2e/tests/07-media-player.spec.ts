import { test, expect } from "@playwright/test";
import { knownCompleteId } from "../helpers/fixtures";

test.describe("Global Media Player", () => {
  // All tests in this suite share the same paper and need audio playing
  test.beforeEach(async ({ page }) => {
    const id = knownCompleteId();
    await page.goto(`/p?id=${id}`);
    const playBtn = page.locator('button:has-text("Play")').first();
    await expect(playBtn).toBeVisible({ timeout: 10000 });
    await playBtn.click();
    // Wait for audio to start
    await page.waitForFunction(
      () => !(document.querySelector("audio") as HTMLAudioElement)?.paused,
      { timeout: 5000 }
    );
  });

  test("header player appears after starting playback", async ({ page }) => {
    // Header player should show speed button
    const speedBtn = page.locator('button:has-text("1x")').first();
    await expect(speedBtn).toBeVisible({ timeout: 5000 });
  });

  test("pause and resume works", async ({ page }) => {
    // Find pause button in the header (title="Pause")
    const pauseBtn = page.locator('button[title="Pause"]').first();
    await expect(pauseBtn).toBeVisible();
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

  test("skip back decreases currentTime", async ({ page }) => {
    // Seek to 30s first so skip back has room
    await page.evaluate(() => {
      (document.querySelector("audio") as HTMLAudioElement).currentTime = 30;
    });
    await page.waitForTimeout(200);

    const timeBefore = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.currentTime
    );

    const skipBack = page.locator('button[title="Back 15s"]').first();
    await skipBack.click();

    const timeAfter = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.currentTime
    );
    expect(timeAfter).toBeLessThan(timeBefore!);
  });

  test("skip forward increases currentTime", async ({ page }) => {
    const timeBefore = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.currentTime
    );

    const skipFwd = page.locator('button[title="Forward 15s"]').first();
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

  test("paper link in header navigates to paper page", async ({ page }) => {
    const id = knownCompleteId();
    // The header player has a link to the paper with title "View paper"
    const paperLink = page.locator('a[title="View paper"]').first();
    await expect(paperLink).toBeVisible({ timeout: 5000 });
    const href = await paperLink.getAttribute("href");
    expect(href).toContain(id);
  });
});
