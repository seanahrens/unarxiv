import { test, expect } from "@playwright/test";

test.describe.skip("Turnstile captcha", () => {
  test("about page: clicking 'Show email address' renders Turnstile without sitekey errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/about");

    // Find and click the "Show email address" button
    const showBtn = page.getByRole("button", { name: "Show email address" });
    await expect(showBtn).toBeVisible({ timeout: 10000 });
    await showBtn.click();

    // "Loading verification..." text should appear while Turnstile loads
    const loadingText = page.getByText("Loading verification...");
    await expect(loadingText).toBeVisible({ timeout: 5000 });

    // Turnstile script should be loaded
    await page.waitForFunction(() => !!document.querySelector('script[src*="turnstile"]'), null, {
      timeout: 10000,
    });

    // Wait for Turnstile to render (loading text disappears when widget renders)
    await expect(loadingText).toBeHidden({ timeout: 15000 });

    // No TurnstileError about empty sitekey
    const sitekeyErrors = consoleErrors.filter((e) => e.includes("sitekey"));
    expect(sitekeyErrors).toHaveLength(0);
  });
});
