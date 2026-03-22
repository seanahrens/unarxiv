import { test, expect } from "@playwright/test";
import { knownCompleteId, PLAYER_SPEED } from "../helpers/fixtures";
import { startAudioPlayback } from "../helpers/page-actions";

// Active (non-fixme) tests — use beforeEach to start audio playback once per test
test.describe("Global Media Player", () => {
  test.beforeEach(async ({ page }) => {
    await startAudioPlayback(page, knownCompleteId());
  });

  test("player bar appears after starting playback", async ({ page }) => {
    // Speed button is the most reliable indicator the PlayerBar is rendered
    const speedBtn = page.locator(PLAYER_SPEED).first();
    await expect(speedBtn).toBeVisible({ timeout: 5000 });
  });

  test("speed button cycles playback rate", async ({ page }) => {
    const speedBtn = page.locator(PLAYER_SPEED).first();
    await expect(speedBtn).toBeVisible({ timeout: 5000 });

    // Verify it shows 1x before clicking
    const initialText = await speedBtn.textContent();
    expect(initialText?.trim()).toBe("1x");

    await speedBtn.click();

    // After clicking, should show 1.25x
    await expect(speedBtn).toHaveText("1.25x", { timeout: 2000 });
  });
});

// These tests are unreliable in headless CI because they depend on the audio element
// actually streaming audio from the network. They are marked fixme and kept in a
// separate describe block so they do NOT trigger the beforeEach audio startup above.
test.describe("Global Media Player (headless-unreliable)", () => {
  test.fixme("pause and resume works", async ({ page }) => {
    test.slow();
    await startAudioPlayback(page, knownCompleteId());

    // Find pause button (title switches to "Pause" while playing)
    const pauseBtn = page.locator('button[title="Pause"]').first();
    await expect(pauseBtn).toBeVisible({ timeout: 10000 });
    await pauseBtn.click();

    const paused = await page.evaluate(
      () => (document.querySelector("audio") as HTMLAudioElement)?.paused
    );
    expect(paused).toBe(true);

    // Resume — button title switches back to "Play"
    const playBtn = page.locator('button[title="Play"]').first();
    await playBtn.click();
    const playing = await page.evaluate(
      () => !(document.querySelector("audio") as HTMLAudioElement)?.paused
    );
    expect(playing).toBe(true);
  });

  test.fixme("skip back decreases currentTime", async ({ page }) => {
    test.slow();
    await startAudioPlayback(page, knownCompleteId());

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
    await startAudioPlayback(page, knownCompleteId());

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

  test.fixme("paper link in player bar navigates to paper page", async ({ page }) => {
    test.slow();
    const id = knownCompleteId();
    await startAudioPlayback(page, id);

    // The PlayerBar has a link to the paper page
    const paperLink = page.locator(`a[href="/p?id=${id}"], a[href*="${id}"]`).first();
    await expect(paperLink).toBeVisible({ timeout: 10000 });
    const href = await paperLink.getAttribute("href");
    expect(href).toContain(id);
  });
});
