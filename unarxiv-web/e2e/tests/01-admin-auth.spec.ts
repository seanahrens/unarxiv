import { test, expect } from "@playwright/test";
import { adminVerify, adminDeletePaper } from "../helpers/api";

test.describe("Admin Auth", () => {
  test("admin page shows password prompt without auth", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.locator('input[type="password"]')
    ).toBeVisible();
    // Should NOT show dashboard content (contributors table)
    await expect(page.locator("text=Top Contributors")).not.toBeVisible();
  });

  test("wrong password is rejected on admin page", async ({ page }) => {
    await page.goto("/admin");
    await page.locator('input[type="password"]').fill("wrong-password-123");
    await page.locator('button:has-text("Continue")').click();
    // Should show error and remain on login
    await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Top Contributors")).not.toBeVisible();
  });

  test("API: verify endpoint rejects missing password", async () => {
    const res = await adminVerify("");
    expect(res.status).toBe(401);
  });

  test("API: verify endpoint rejects wrong password", async () => {
    const res = await adminVerify("wrong-password-123");
    expect(res.status).toBe(401);
  });

  test("API: delete endpoint rejects unauthenticated request", async () => {
    const res = await adminDeletePaper("fake-id-12345", "");
    expect(res.status).toBe(401);
  });

  test("API: delete endpoint rejects wrong password", async () => {
    const res = await adminDeletePaper("fake-id-12345", "wrong-password-123");
    expect(res.status).toBe(401);
  });
});
