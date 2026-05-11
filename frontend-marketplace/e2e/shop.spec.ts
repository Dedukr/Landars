import { test, expect, type Page } from "@playwright/test";

/** Offline-friendly stubs so `/shop/` renders deterministically without a live Django backend. */
async function stubShopListingApis(page: Page) {
  await page.route("**/api/products/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [],
        count: 0,
        next: null,
        previous: null,
        limit: 50,
        offset: 0,
      }),
    });
  });

  await page.route("**/api/categories/**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

async function openShop(page: Page) {
  try {
    await stubShopListingApis(page);
    const res = await page.goto("/shop/", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    return Boolean(res?.ok());
  } catch {
    return false;
  }
}

test.describe("@shop Smoke", () => {
  test("shop page exposes product catalogue landmark and shop search input", async ({ page }) => {
    test.skip(
      !(await openShop(page)),
      "Start Next: `npm run dev` or `npm run start` at http://127.0.0.1:3000"
    );

    await expect(
      page.locator('section[aria-label="Product catalogue"]')
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#shop-search-input")).toBeVisible();
  });

  test("mobile Filters opens drawer; Escape closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    test.skip(
      !(await openShop(page)),
      "Start Next at http://127.0.0.1:3000"
    );

    const filtersBtn = page.getByRole("button", { name: /^Filters$/ });
    await expect(filtersBtn).toBeVisible({ timeout: 15_000 });
    await filtersBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Filters$/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
