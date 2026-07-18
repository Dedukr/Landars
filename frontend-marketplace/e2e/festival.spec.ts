import { test, expect, type Page } from "@playwright/test";

async function stubFestivalApis(page: Page, opts?: { offline?: boolean }) {
  await page.route("**/api/auth/csrf-token/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "e2e-csrf-token" }),
    });
  });

  await page.route("**/api/auth/profile/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: 1,
          name: "Festival Staff",
          first_name: "Festival",
          surname: "Staff",
          email: "staff@example.com",
          is_staff: true,
          can_use_festival: true,
        },
      }),
    });
  });

  await page.route("**/api/festival/products/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            id: 1,
            name: "Varenyky",
            image: "",
            price: "8.50",
            vat_rate: "0",
          },
          {
            id: 2,
            name: "Kvas",
            image: "",
            price: "3.00",
            vat_rate: "20",
          },
        ],
      }),
    });
  });

  await page.route("**/api/festival/status/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        enabled: true,
        mode: opts?.offline ? "cloudprnt" : "disabled",
        online: !opts?.offline,
        last_seen_at: null,
        queued_jobs: opts?.offline ? 3 : 0,
        can_accept_orders: !opts?.offline,
      }),
    });
  });

  await page.route("**/api/festival/orders/**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: 99,
        order_number: "12",
        total_price: "8.50",
        created_at: "2026-07-13T12:00:00Z",
        invoice_number: "FINV-000099",
        print_status: "queued",
        replayed: false,
        status: "PAID",
      }),
    });
  });
}

async function seedAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("authToken", "test-access");
    localStorage.setItem("refreshToken", "test-refresh");
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: 1,
        name: "Festival Staff",
        email: "staff@example.com",
        is_staff: true,
        can_use_festival: true,
      })
    );
  });
}

test.describe("@festival Till", () => {
  test("unauthorised users are redirected to sign-in", async ({ page }) => {
    await page.route("**/api/auth/profile/**", async (route) => {
      await route.fulfill({ status: 401, body: "{}" });
    });
    const res = await page.goto("/festival", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    test.skip(!res, "Start Next at http://127.0.0.1:3000");
    await expect(page).toHaveURL(/auth|sign/i, { timeout: 15_000 });
  });

  test("product grid, quantity, place order, success number", async ({
    page,
  }) => {
    await seedAuth(page);
    await stubFestivalApis(page);
    const res = await page.goto("/festival", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    test.skip(!res?.ok(), "Start Next at http://127.0.0.1:3000");

    await expect(page.getByRole("heading", { name: "Festival Orders" })).toBeVisible();
    await expect(page.getByText("Varenyky")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Increase Varenyky").click();
    const orderBtn = page.getByRole("button", { name: /Place order/i });
    await expect(orderBtn).toBeEnabled();
    await orderBtn.click();
    await expect(page.getByText("#12", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("duplicate click prevented while submitting", async ({ page }) => {
    await seedAuth(page);
    await stubFestivalApis(page);
    let orderCalls = 0;
    await page.route("**/api/festival/orders/**", async (route) => {
      if (route.request().method() === "POST") {
        orderCalls += 1;
        await new Promise((r) => setTimeout(r, 400));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: 1,
            order_number: "3",
            total_price: "8.50",
            created_at: "2026-07-13T12:00:00Z",
            invoice_number: "FINV-1",
            print_status: "queued",
            replayed: false,
            status: "PAID",
          }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/festival", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Increase Varenyky").click();
    const btn = page.getByRole("button", { name: /Place order/i });
    await Promise.all([btn.click(), btn.click()]);
    await expect(page.getByText("#3", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    expect(orderCalls).toBe(1);
  });

  test("tablet viewport renders grid", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await seedAuth(page);
    await stubFestivalApis(page);
    await page.goto("/festival", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Festival products")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("printer offline state", async ({ page }) => {
    await seedAuth(page);
    await stubFestivalApis(page, { offline: true });
    await page.goto("/festival", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Printer offline/i)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel("Increase Varenyky").click();
    await expect(
      page.getByRole("button", { name: /Place order/i })
    ).toBeDisabled();
  });
});
