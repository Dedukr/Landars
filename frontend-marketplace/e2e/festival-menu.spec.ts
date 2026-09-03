import { expect, test } from "@playwright/test";

const sampleMenu = {
  included_meal_offer: "Main + side + drink for £15",
  categories: [
    {
      name: "Meals",
      products: [
        {
          name: "Shashlik",
          category: "Meals",
          image: "https://picsum.photos/seed/shashlik/800/640",
          price: "9.00",
          portion: "Skewer",
          description: "Chargrilled skewer with herbs",
          fillings: [{ name: "Chicken" }, { name: "Pork" }],
          additions: [],
          ingredients: "Meat, spices, onion",
          toppings: "Garlic sauce",
          allergens: "None declared",
        },
        {
          name: "Varenyky",
          category: "Meals",
          image: "https://picsum.photos/seed/varenyky/800/640",
          price: "8.50",
          portion: "6 pieces",
          description: "Handmade dumplings",
          fillings: [{ name: "Potato" }, { name: "Cheese" }],
          additions: [],
          ingredients: "Flour, potato, onion",
          toppings: "",
          allergens: "Gluten, milk",
        },
      ],
    },
    {
      name: "Jerky",
      products: [
        {
          name: "Beef Jerky",
          category: "Jerky",
          image: "https://picsum.photos/seed/jerky/800/640",
          price: "6.00",
          portion: "80 g",
          description: "Slow-dried beef",
          fillings: [],
          additions: [],
          ingredients: "Beef, salt, spices",
          toppings: "",
          allergens: "",
        },
      ],
    },
    {
      name: "Drinks",
      products: [
        {
          name: "Kvas",
          category: "Drinks",
          image: "https://picsum.photos/seed/kvas/800/640",
          price: "3.00",
          portion: "500 ml",
          description: "Traditional fermented drink",
          fillings: [],
          additions: [],
          ingredients: "Rye bread, water",
          toppings: "",
          allergens: "Gluten",
        },
      ],
    },
  ],
};

async function mockPublicMenu(page: import("@playwright/test").Page) {
  await page.route("**/api/festival/menu/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sampleMenu),
    });
  });
}

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

test.describe("@festival-menu Public menu", () => {
  for (const viewport of viewports) {
    test(`renders without clipping at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await mockPublicMenu(page);

      const response = await page.goto("/festival-menu", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(400);

      await expect(page.getByRole("heading", { name: "Festival Menu" })).toBeVisible();
      await expect(page.getByText("Chicken")).toBeVisible();
      await expect(page.getByText("Pork")).toBeVisible();
      await expect(page.getByText(sampleMenu.included_meal_offer)).toBeVisible();

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasHorizontalOverflow).toBe(false);

      const clippedPrice = await page.evaluate(() => {
        const price = document.querySelector(".festival-menu-card-price");
        if (!price) return true;
        const rect = price.getBoundingClientRect();
        return rect.right > window.innerWidth || rect.left < 0;
      });
      expect(clippedPrice).toBe(false);
    });
  }

  test("does not redirect anonymous visitors to sign-in", async ({ page }) => {
    await mockPublicMenu(page);
    await page.goto("/festival-menu", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/festival-menu/);
    await expect(page.getByRole("heading", { name: "Festival Menu" })).toBeVisible();
    await expect(
      page.locator(".festival-menu-page").getByText(/sign in/i)
    ).not.toBeVisible();
  });

  test("never calls staff festival APIs", async ({ page }) => {
    const staffCalls: string[] = [];
    for (const path of ["/api/festival/products/", "/api/festival/status/", "/api/festival/orders/"]) {
      await page.route(`**${path}**`, async (route) => {
        staffCalls.push(path);
        await route.fulfill({ status: 401, body: "{}" });
      });
    }
    await mockPublicMenu(page);
    await page.goto("/festival-menu", { waitUntil: "networkidle" });
    expect(staffCalls).toEqual([]);
  });
});
