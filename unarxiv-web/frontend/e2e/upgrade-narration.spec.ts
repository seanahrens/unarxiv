import { test, expect, type Page } from "@playwright/test";
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
const WORKER_URL = process.env.WORKER_URL ?? testEnv["WORKER_URL"] ?? "http://localhost:8787";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? testEnv["WEBHOOK_SECRET"] ?? "dev-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? testEnv["ADMIN_PASSWORD"] ?? "localdev";

/** Open the Upgrade Voice modal from a narrated paper page. */
async function openUpgradeModal(page: Page) {
  await page.click('[data-testid="open-paper-actions"]');
  const upgradeBtn = page.locator('[data-testid="upgrade-narration"]');
  await expect(upgradeBtn).toBeVisible({ timeout: 5000 });
  await upgradeBtn.click();
  await expect(page.locator('h2').filter({ hasText: 'Upgrade Voice' })).toBeVisible();
}

/** Wait for option cards to finish loading (skeleton pulse animation gone). */
async function waitForOptions(page: Page) {
  await page.waitForFunction(() => {
    const pulses = document.querySelectorAll('.animate-pulse');
    return pulses.length === 0;
  }, { timeout: 10000 });
}

/** Select an option by its quality label and advance to step 2. */
async function selectOptionAndContinue(page: Page, qualityLabel: string) {
  await waitForOptions(page);
  // Use the option card button that contains the quality label as a semibold span
  await page.locator('button', { has: page.locator(`span.font-semibold:text-is("${qualityLabel}")`) }).click();
  await page.getByRole('button', { name: /Continue|Review & Confirm/ }).click();
}

test.describe("Upgrade Voice Modal", () => {
  test.beforeEach(async ({ page }) => {
    // Clean up upgrade versions so the paper is in base state (not fully upgraded)
    await fetch(`${WORKER_URL}/api/admin/papers/${PAPER_ID}/upgrade-versions`, {
      method: 'DELETE',
      headers: { 'X-Admin-Password': ADMIN_PASSWORD },
    }).catch(() => {});

    // Clear localStorage to reset stored keys/last option between tests
    await page.goto(PAPER_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test("1. Modal opens from menu", async ({ page }) => {
    await openUpgradeModal(page);
  });

  test("2. Options displayed — verify 3 quality tiers", async ({ page }) => {
    await openUpgradeModal(page);
    await waitForOptions(page);

    // Verify the 3 quality labels using exact text match on the semibold span
    await expect(page.locator('span.font-semibold:text-is("Most Lifelike Voice")')).toBeVisible();
    await expect(page.locator('span.font-semibold:text-is("More Polished Voice")')).toBeVisible();
    await expect(page.locator('span.font-semibold:text-is("Just Improved Script")')).toBeVisible();
  });

  test("3. Most Lifelike Voice is default selected, Continue is enabled", async ({ page }) => {
    await openUpgradeModal(page);
    await waitForOptions(page);

    // Most Lifelike Voice should be pre-selected (border-stone-700)
    const lifelikeCard = page.locator('button', { has: page.locator('span.font-semibold:text-is("Most Lifelike Voice")') });
    await expect(lifelikeCard).toHaveClass(/border-stone-700/);

    // Continue should be enabled since an option is selected
    const continueBtn = page.getByRole('button', { name: /Continue|Review & Confirm/ });
    await expect(continueBtn).toBeEnabled();
  });

  test("4. Selecting a different option updates highlight", async ({ page }) => {
    await openUpgradeModal(page);
    await waitForOptions(page);

    // Click More Polished Voice
    const polishedCard = page.locator('button', { has: page.locator('span.font-semibold:text-is("More Polished Voice")') });
    await polishedCard.click();
    await expect(polishedCard).toHaveClass(/border-stone-700/);

    // Most Lifelike Voice should no longer be highlighted
    const lifelikeCard = page.locator('button', { has: page.locator('span.font-semibold:text-is("Most Lifelike Voice")') });
    await expect(lifelikeCard).not.toHaveClass(/border-stone-700/);
  });

  test("5. Step 2 — key entry form appears after Continue with More Polished Voice (OpenAI)", async ({ page }) => {
    await openUpgradeModal(page);
    await selectOptionAndContinue(page, "More Polished Voice");

    // Step 2 should show the password input
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('label').filter({ hasText: /OpenAI API Key/ }).first()).toBeVisible();
  });

  test("6. Key validation — enter OpenAI key and verify test completes", async ({ page }) => {
    test.skip(!TEST_OPENAI_KEY, "TEST_OPENAI_KEY not set — skipping key validation test");

    await openUpgradeModal(page);
    await selectOptionAndContinue(page, "More Polished Voice");

    await page.locator('input[type="password"]').first().fill(TEST_OPENAI_KEY);

    // Auto-validation triggers on paste — wait for result (shows either ✓ Valid or ✗ Invalid)
    await expect(page.locator('span').filter({ hasText: /Valid|Invalid/ }).first()).toBeVisible({ timeout: 15000 });
  });

  test("7. Review & Confirm disabled until key is valid", async ({ page }) => {
    await openUpgradeModal(page);
    await selectOptionAndContinue(page, "More Polished Voice");

    // Before entering a key, Review & Confirm should be disabled
    const confirmBtn = page.getByRole('button', { name: 'Review & Confirm' });
    await expect(confirmBtn).toBeDisabled();

    // Enter an invalid key and wait for auto-validation
    await page.locator('input[type="password"]').first().fill("sk-invalid-key-1234567890");
    await expect(page.locator('span').filter({ hasText: /Invalid/ })).toBeVisible({ timeout: 15000 });

    // Button should still be disabled after invalid key
    await expect(confirmBtn).toBeDisabled();
  });

  test("8. Cancel closes modal", async ({ page }) => {
    await openUpgradeModal(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('h2').filter({ hasText: 'Upgrade Voice' })).not.toBeVisible();
  });

  test("9. Backdrop click closes modal", async ({ page }) => {
    await openUpgradeModal(page);
    await page.mouse.click(10, 10);
    await expect(page.locator('h2').filter({ hasText: 'Upgrade Voice' })).not.toBeVisible();
  });

  test("10. Back navigation — step 2 back returns to step 1", async ({ page }) => {
    await openUpgradeModal(page);
    await selectOptionAndContinue(page, "More Polished Voice");

    // Verify we're on step 2
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // Click Back
    await page.getByRole('button', { name: 'Back', exact: true }).click();

    // Verify we're back on step 1
    await expect(page.locator('span.font-semibold:text-is("Most Lifelike Voice")')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Full upgrade flow: webhook simulation → UI indicators
// ---------------------------------------------------------------------------

test.describe("Upgrade Voice Full Flow", () => {
  // Tests modify shared DB state (webhook inserts versions), so must run in order
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ }, testInfo) => {
    // Clean up upgrade versions from any prior test run
    await fetch(`${WORKER_URL}/api/admin/papers/${PAPER_ID}/upgrade-versions`, {
      method: 'DELETE',
      headers: { 'X-Admin-Password': ADMIN_PASSWORD },
    }).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(PAPER_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test("11. No stars on play button before upgrade", async ({ page }) => {
    await expect(page.locator('[data-testid="play-paper"]')).toBeVisible();
    await expect(page.locator('[data-testid="play-stars"]')).not.toBeVisible();
  });

  test("12. No disabled options in modal before upgrade", async ({ page }) => {
    await openUpgradeModal(page);
    await waitForOptions(page);
    await expect(page.locator('[data-testid="completed-badge"]')).not.toBeVisible();
    // All options should be enabled
    const disabledBtns = page.locator('button[disabled]').filter({ has: page.locator('span.font-semibold') });
    await expect(disabledBtns).toHaveCount(0);
  });

  test("13. Simulate upgrade webhook → stars appear on play button", async ({ page, request }) => {
    // Verify no stars initially
    await expect(page.locator('[data-testid="play-stars"]')).not.toBeVisible();

    // Send upgrade completion webhook (elevenlabs = 5 stars) directly to the worker
    const webhookResponse = await request.post(`${WORKER_URL}/api/webhooks/modal`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEBHOOK_SECRET}`,
      },
      data: {
        arxiv_id: PAPER_ID,
        status: 'narrated',
        audio_r2_key: `audio/${PAPER_ID}/premium-elevenlabs.mp3`,
        duration_seconds: 600,
        eta_seconds: 0,
        narration_tier: 'plus3',
        script_type: 'upgraded',
        tts_provider: 'elevenlabs',
        tts_model: 'eleven_multilingual_v2',
        llm_provider: 'openai',
        llm_model: 'gpt-4o',
        actual_cost: 0.55,
        llm_cost: 0.05,
        tts_cost: 0.50,
      },
    });
    expect(webhookResponse.ok()).toBeTruthy();

    // Reload and verify stars appear on play button
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="play-stars"]')).toBeVisible();
  });

  test("14. Fully upgraded → all options disabled, Upgrade Voice hidden from menu", async ({ page }) => {
    // Paper already has elevenlabs (5★) from test 13 — fully upgraded

    // Open menu and verify "Upgrade Voice" is no longer shown
    await page.click('[data-testid="open-paper-actions"]');
    await expect(page.locator('[data-testid="upgrade-narration"]')).not.toBeVisible();
  });
});
