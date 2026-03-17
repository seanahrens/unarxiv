import { test, expect } from "@playwright/test";
import { API_BASE, ADMIN_PASSWORD, knownCompleteId } from "../helpers/fixtures";

let testListId: string;
let testListToken: string;

test.describe("Lists API", () => {
  test("create a list", async () => {
    const res = await fetch(`${API_BASE}/api/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Test List", description: "Automated test" }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.list.id).toMatch(/^[a-z0-9]{4}$/);
    expect(data.owner_token).toBeTruthy();
    expect(data.list.name).toBe("E2E Test List");
    testListId = data.list.id;
    testListToken = data.owner_token;
  });

  test("get list (public)", async () => {
    const res = await fetch(`${API_BASE}/api/lists/${testListId}`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.list.name).toBe("E2E Test List");
    expect(data.papers).toHaveLength(0);
  });

  test("add items to list", async () => {
    const paperId = knownCompleteId();
    const res = await fetch(`${API_BASE}/api/lists/${testListId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-List-Token": testListToken },
      body: JSON.stringify({ paper_ids: [paperId] }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.added).toBe(1);

    // Verify paper appears in list
    const getRes = await fetch(`${API_BASE}/api/lists/${testListId}`);
    const getData = await getRes.json();
    expect(getData.papers).toHaveLength(1);
    expect(getData.papers[0].id).toBe(paperId);
  });

  test("update list metadata", async () => {
    const res = await fetch(`${API_BASE}/api/lists/${testListId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-List-Token": testListToken },
      body: JSON.stringify({ name: "Updated Name", description: "Updated desc" }),
    });
    expect(res.ok).toBe(true);

    const getRes = await fetch(`${API_BASE}/api/lists/${testListId}`);
    const data = await getRes.json();
    expect(data.list.name).toBe("Updated Name");
    expect(data.list.description).toBe("Updated desc");
  });

  test("auth required for mutations", async () => {
    // No token
    const res1 = await fetch(`${API_BASE}/api/lists/${testListId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(res1.status).toBe(403);

    // Wrong token
    const res2 = await fetch(`${API_BASE}/api/lists/${testListId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-List-Token": "wrongtoken" },
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(res2.status).toBe(403);
  });

  test("reorder list items", async () => {
    // Add a second paper first
    const paperId = knownCompleteId();
    // Get all papers to find a second one
    const papersRes = await fetch(`${API_BASE}/api/papers?sort=popular`);
    const papersData = await papersRes.json();
    const secondPaper = papersData.papers.find((p: any) => p.id !== paperId && p.status === "complete");
    if (!secondPaper) return; // skip if only one paper

    await fetch(`${API_BASE}/api/lists/${testListId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-List-Token": testListToken },
      body: JSON.stringify({ paper_ids: [secondPaper.id] }),
    });

    // Reorder: put second paper first
    const res = await fetch(`${API_BASE}/api/lists/${testListId}/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-List-Token": testListToken },
      body: JSON.stringify({ paper_ids: [secondPaper.id, paperId] }),
    });
    expect(res.ok).toBe(true);

    // Verify order
    const getRes = await fetch(`${API_BASE}/api/lists/${testListId}`);
    const data = await getRes.json();
    expect(data.papers[0].id).toBe(secondPaper.id);
  });

  test("remove item from list", async () => {
    const paperId = knownCompleteId();
    const res = await fetch(`${API_BASE}/api/lists/${testListId}/items/${paperId}`, {
      method: "DELETE",
      headers: { "X-List-Token": testListToken },
    });
    expect(res.ok).toBe(true);
  });

  test("my-lists returns owned lists", async () => {
    const res = await fetch(`${API_BASE}/api/my-lists`, {
      headers: { "X-List-Token": testListToken },
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.lists.some((l: any) => l.id === testListId)).toBe(true);
  });

  test("delete list", async () => {
    const res = await fetch(`${API_BASE}/api/lists/${testListId}`, {
      method: "DELETE",
      headers: { "X-List-Token": testListToken },
    });
    expect(res.ok).toBe(true);

    // Verify gone
    const getRes = await fetch(`${API_BASE}/api/lists/${testListId}`);
    expect(getRes.status).toBe(404);
  });
});

test.describe("Lists Frontend", () => {
  test("lists management page renders", async ({ page }) => {
    await page.goto("/l/");
    await expect(page.locator("h1:has-text('My Lists')")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="List name"]')).toBeVisible();
  });

  test("create list and view it", async ({ page }) => {
    await page.goto("/l/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Fill in form
    await page.fill('input[placeholder="List name"]', "Playwright Test List");
    await page.fill('textarea[placeholder="Description (optional)"]', "Test description");
    await page.click('button:has-text("Create List")');

    // Wait for the list to appear
    await expect(page.locator('h3:has-text("Playwright Test List")')).toBeVisible({ timeout: 10000 });

    // Click into the list
    await page.locator('h3:has-text("Playwright Test List")').click();

    // Should see the list view
    await expect(page.locator('h1:has-text("Playwright Test List")')).toBeVisible({ timeout: 5000 });

    // Clean up: delete the list
    const editBtn = page.locator('button:has-text("Edit")');
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.click('button:has-text("Delete List")');
      page.on("dialog", (dialog) => dialog.accept());
    }
  });
});

test.describe("Lists Admin", () => {
  test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD not set");

  test("admin can see all lists with tokens", async () => {
    // Create a list first
    const createRes = await fetch(`${API_BASE}/api/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Admin Test" }),
    });
    const { list, owner_token } = await createRes.json();

    // Admin endpoint
    const res = await fetch(`${API_BASE}/api/admin/lists`, {
      headers: { "X-Admin-Password": ADMIN_PASSWORD },
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    const found = data.lists.find((l: any) => l.id === list.id);
    expect(found).toBeTruthy();
    expect(found.owner_token).toBe(owner_token);

    // Cleanup
    await fetch(`${API_BASE}/api/lists/${list.id}`, {
      method: "DELETE",
      headers: { "X-List-Token": owner_token },
    });
  });
});
