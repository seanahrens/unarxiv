import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const PAPER_ID = "2301.07041";
const PAPER_URL = `/p?id=${PAPER_ID}`;

// Load .env.test.local manually (dotenv not available in this project)
function loadTestEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../.env.test.local");
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    result[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return result;
}

const testEnv = loadTestEnv();
const TEST_OPENAI_KEY = process.env.TEST_OPENAI_KEY ?? testEnv["TEST_OPENAI_KEY"] ?? "";

test.describe("Premium Narration Modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAPER_URL);
    // Wait for the page to load
    await page.waitForLoadState("networkidle");
  });

  test("1. Modal opens — click actions menu, click Premium Narration, verify modal appears", async ({ page }) => {
    // Open the actions menu
    await page.click('[data-testid="open-paper-actions"]');
    // Click Premium Narration
    await page.click('[data-testid="premium-narration"]');
    // Verify modal title
    await expect(page.locator('h2').filter({ hasText: 'Premium Narration' })).toBeVisible();
  });

  test("2. Options displayed — verify 4 options are shown", async ({ page }) => {
    await page.click('[data-testid="open-paper-actions"]');
    await page.click('[data-testid="premium-narration"]');

    // Wait for options to load (skeleton disappears)
    await page.waitForFunction(() => {
      const pulses = document.querySelectorAll('.animate-pulse');
      return pulses.length === 0;
    }, { timeout: 10000 });

    // Verify the 4 option names
    await expect(page.getByText('ElevenLabs')).toBeVisible();
    await expect(page.getByText('OpenAI TTS')).toBeVisible();
    await expect(page.getByText('Google Cloud TTS')).toBeVisible();
    await expect(page.getByText('Microsoft Edge TTS')).toBeVisible();
  });

  test("3. No pre-selection — Continue button is disabled until an option is selected", async ({ page }) => {
    await page.click('[data-testid="open-paper-actions"]');
    await page.click('[data-testid="premium-narration"]');

    // Wait for options to load
    await page.waitForFunction(() => {
      const pulses = document.querySelectorAll('.animate-pulse');
      return pulses.length === 0;
    }, { timeout: 10000 });

    // The Continue button should be disabled (no option selected, no estimate)
    const continueBtn = page.getByRole('button', { name: /Continue|Review & Confirm/ });
    await expect(continueBtn).toBeDisabled();
  });

  test("4. Option selection — click OpenAI TTS, verify it becomes selected, Continue becomes enabled", async ({ page }) => {
    await page.click('[data-testid="open-paper-actions"]');
    await page.click('[data-testid="premium-narration"]');

    // Wait for options to load
    await page.waitForFunction(() => {
      const pulses = document.querySelectorAll('.animate-pulse');
      return pulses.length === 0;
    }, { timeout: 10000 });

    // Click OpenAI TTS option
    await page.getByText('OpenAI TTS').click();

    // Verify Continue button becomes enabled
    const continueBtn = page.getByRole('button', { name: /Continue|Review & Confirm/ });
    await expect(continueBtn).toBeEnabled();

    // Verify the option card is highlighted (has border-stone-700 class)
    const optionCard = page.locator('button').filter({ hasText: 'OpenAI TTS' });
    await expect(optionCard).toHaveClass(/border-stone-700/);
  });

  test("5. Step 2 — key entry form appears after clicking Continue with OpenAI TTS", async ({ page }) => {
    await page.click('[data-testid="open-paper-actions"]');
    await page.click('[data-testid="premium-narration"]');

    // Wait for options to load
    await page.waitForFunction(() => {
      const pulses = document.querySelectorAll('.animate-pulse');
      return pulses.length === 0;
    }, { timeout: 10000 });

    // Select OpenAI TTS
    await page.getByText('OpenAI TTS').click();

    // Click Continue
    const continueBtn = page.getByRole('button', { name: /Continue|Review & Confirm/ });
    await continueBtn.click();

    // Step 2 should show the password input for the API key
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    // Verify the key label text is shown in step 2
    await expect(page.locator('label').filter({ hasText: /OpenAI API Key/ }).first()).toBeVisible();
  });

  test("6. Key validation — enter OpenAI key and verify it shows Valid", async ({ page }) => {
    test.skip(!TEST_OPENAI_KEY, "TEST_OPENAI_KEY not set — skipping key validation test");

    await page.click('[data-testid="open-paper-actions"]');
    await page.click('[data-testid="premium-narration"]');

    // Wait for options to load
    await page.waitForFunction(() => {
      const pulses = document.querySelectorAll('.animate-pulse');
      return pulses.length === 0;
    }, { timeout: 10000 });

    // Select OpenAI TTS and continue to step 2
    await page.getByText('OpenAI TTS').click();
    const continueBtn = page.getByRole('button', { name: /Continue|Review & Confirm/ });
    await continueBtn.click();

    // Enter the API key
    const keyInput = page.locator('input[type="password"]').first();
    await keyInput.fill(TEST_OPENAI_KEY);

    // Click Test
    await page.getByRole('button', { name: 'Test' }).click();

    // Wait for validation (may take a few seconds) — look for the button containing "Valid" text
    await expect(page.locator('button').filter({ hasText: /Valid/ }).first()).toBeVisible({ timeout: 15000 });
  });

  test("7. Step 3 — confirm shows cost summary and Start Premium Narration button", async ({ page }) => {
    test.skip(!TEST_OPENAI_KEY, "TEST_OPENAI_KEY not set — skipping step 3 test");

    await page.click('[data-testid="open-paper-actions"]');
    await page.click('[data-testid="premium-narration"]');

    // Wait for options to load
    await page.waitForFunction(() => {
      const pulses = document.querySelectorAll('.animate-pulse');
      return pulses.length === 0;
    }, { timeout: 10000 });

    // Select OpenAI TTS and continue to step 2
    await page.getByText('OpenAI TTS').click();
    const continueBtn = page.getByRole('button', { name: /Continue|Review & Confirm/ });
    await continueBtn.click();

    // Enter the key
    const keyInput = page.locator('input[type="password"]').first();
    await keyInput.fill(TEST_OPENAI_KEY);

    // Click Review & Confirm
    const reviewBtn = page.getByRole('button', { name: 'Review & Confirm' });
    await reviewBtn.click();

    // Step 3: verify cost summary and Start button
    await expect(page.getByText('Estimated cost')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Start Premium Narration' })).toBeVisible();
    // Verify the Start button is present (but do NOT click it — that costs money)
    await expect(page.getByRole('button', { name: 'Start Premium Narration' })).toBeEnabled();
  });

  test("8. Cancel works — Cancel button closes modal", async ({ page }) => {
    await page.click('[data-testid="open-paper-actions"]');
    await page.click('[data-testid="premium-narration"]');

    // Verify modal is open
    await expect(page.locator('h2').filter({ hasText: 'Premium Narration' })).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Modal should be gone
    await expect(page.locator('h2').filter({ hasText: 'Premium Narration' })).not.toBeVisible();
  });

  test("9. Backdrop click closes modal", async ({ page }) => {
    await page.click('[data-testid="open-paper-actions"]');
    await page.click('[data-testid="premium-narration"]');

    // Verify modal is open
    await expect(page.locator('h2').filter({ hasText: 'Premium Narration' })).toBeVisible();

    // Click the backdrop (the fixed overlay div behind the modal)
    // Click at top-left corner which is outside the centered modal content
    await page.mouse.click(10, 10);

    // Modal should be gone
    await expect(page.locator('h2').filter({ hasText: 'Premium Narration' })).not.toBeVisible();
  });
});
