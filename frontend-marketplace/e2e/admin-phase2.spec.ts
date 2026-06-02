import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

type MockUser = {
  id: number;
  name: string;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
};

const STAFF_USER: MockUser = {
  id: 1,
  name: "Staff Tester",
  email: "staff@test.local",
  is_staff: true,
  is_superuser: true,
};

const CUSTOMER_USER: MockUser = {
  id: 2,
  name: "Customer Tester",
  email: "customer@test.local",
  is_staff: false,
  is_superuser: false,
};

const DASHBOARD_ROUTES = [
  {
    path: "/dashboard",
    title: "Dashboard",
    navLabel: "Dashboard",
    emptyPattern: /module is not connected yet|Activity feed will be connected|Dashboard foundation is ready|Total orders/i,
  },
  {
    path: "/dashboard/orders",
    title: "Orders",
    navLabel: "Orders",
    emptyPattern: /Orders module is not connected yet/i,
  },
  {
    path: "/dashboard/products",
    title: "Products",
    navLabel: "Products",
    emptyPattern: /Products module is not connected yet/i,
  },
  {
    path: "/dashboard/customers",
    title: "Customers",
    navLabel: "Customers",
    emptyPattern: /Customers module is not connected yet/i,
  },
  {
    path: "/dashboard/invoices",
    title: "Invoices",
    navLabel: "Invoices",
    emptyPattern: /Invoices module is not connected yet/i,
  },
  {
    path: "/dashboard/credit-notes",
    title: "Credit Notes",
    navLabel: "Credit Notes",
    emptyPattern: /Credit notes module is not connected yet/i,
  },
  {
    path: "/dashboard/shipments",
    title: "Shipments",
    navLabel: "Shipments",
    emptyPattern: /Shipments module is not connected yet/i,
  },
  {
    path: "/dashboard/reconciliation",
    title: "Reconciliation",
    navLabel: "Reconciliation",
    emptyPattern: /Reconciliation module is not connected yet/i,
  },
  {
    path: "/dashboard/notifications",
    title: "Notifications",
    navLabel: "Notifications",
    emptyPattern: /Notifications module is not connected yet/i,
  },
  {
    path: "/dashboard/document-sequences",
    title: "Document Sequences",
    navLabel: "Document Sequences",
    emptyPattern: /Document sequences module is not connected yet/i,
  },
  {
    path: "/dashboard/reports",
    title: "Reports",
    navLabel: "Reports",
    emptyPattern: /Reports module is not connected yet/i,
  },
] as const;

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const IGNORED_CONSOLE_PATTERNS = [
  /Download the React DevTools/i,
  /Fast Refresh/i,
  /\[HMR\]/i,
];

function isIgnoredConsoleMessage(text: string): boolean {
  return IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
}

function attachConsoleCollector(page: Page) {
  const errors: string[] = [];

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (isIgnoredConsoleMessage(text)) return;
    errors.push(text);
  });

  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  return errors;
}

async function stubAdminApis(page: Page, user: MockUser | null) {
  await page.route("**/api/auth/csrf-token/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "playwright-csrf-token" }),
    });
  });

  await page.route("**/api/cart/**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route("**/api/wishlist/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await stubDashboardSummary(page);
  await stubProfile(page, user);
}

async function stubDashboardSummary(page: Page) {
  await page.route("**/api/dashboard/summary/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total_orders: 12,
        pending_orders: 3,
        completed_orders: 9,
        total_products: 45,
        active_products: 40,
        total_customers: 28,
        total_shipments: 6,
        unreconciled_bank_transactions: 2,
      }),
    });
  });
}

async function stubProfile(page: Page, user: MockUser | null) {
  await page.route("**/api/auth/profile/**", async (route) => {
    if (!user) {
      await route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user }),
    });
  });
}

async function seedAuthStorage(page: Page, user: MockUser) {
  await page.addInitScript((storedUser) => {
    localStorage.setItem("authToken", "playwright-access-token");
    localStorage.setItem("refreshToken", "playwright-refresh-token");
    localStorage.setItem("user", JSON.stringify(storedUser));
  }, user);
}

async function clearAuthStorage(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  });
}

async function openDashboardRoute(page: Page, path: string) {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  return response;
}

async function expectAdminShell(page: Page) {
  await expect(page.locator("#admin-main-content")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: /Open menu|Collapse sidebar|Expand sidebar/,
      })
      .first(),
  ).toBeVisible();
}

async function expectActiveNavItem(page: Page, navLabel: string) {
  const activeLink = page.locator('a[aria-current="page"]').filter({ hasText: navLabel });
  await expect(activeLink.first()).toBeVisible();
}

test.describe("@admin Phase 2 — visual routes", () => {
  for (const route of DASHBOARD_ROUTES) {
    test(`${route.path} loads shell, nav, breadcrumbs, header, and placeholder`, async ({
      page,
    }) => {
      const consoleErrors = attachConsoleCollector(page);
      await stubAdminApis(page, STAFF_USER);
      await seedAuthStorage(page, STAFF_USER);

      const response = await openDashboardRoute(page, route.path);
      expect(response?.ok()).toBeTruthy();

      await expectAdminShell(page);
      await expect(
        page
          .locator("#admin-main-content")
          .getByRole("heading", { level: 1, name: route.title }),
      ).toBeVisible();
      await expect(page.getByRole("navigation", { name: "breadcrumb" })).toContainText(
        route.title,
      );
      await expectActiveNavItem(page, route.navLabel);
      await expect(page.getByText(route.emptyPattern).first()).toBeVisible();

      expect(consoleErrors, `Console errors on ${route.path}`).toEqual([]);
    });
  }
});

test.describe("@admin Phase 2 — responsive shell", () => {
  test.beforeEach(async ({ page }) => {
    await stubAdminApis(page, STAFF_USER);
    await seedAuthStorage(page, STAFF_USER);
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} (${viewport.width}px) layout is clean`, async ({ page }) => {
      const consoleErrors = attachConsoleCollector(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const response = await openDashboardRoute(page, "/dashboard/orders");
      expect(response?.ok()).toBeTruthy();
      await expectAdminShell(page);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(1);

      if (viewport.width < 1024) {
        const menuButton = page.getByRole("button", { name: "Open menu" });
        await expect(menuButton).toBeVisible();
        await menuButton.focus();
        await expect(menuButton).toBeFocused();
        await menuButton.click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByRole("link", { name: "Orders" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      } else {
        await expect(page.locator('aside[aria-label="Admin navigation"]')).toBeVisible();

        const collapseButton = page
          .locator('aside[aria-label="Admin navigation"]')
          .getByRole("button", { name: /Collapse sidebar|Expand sidebar/ })
          .first();
        await collapseButton.click();
        await expect(
          page.locator('aside[aria-label="Admin navigation"]').getByRole("button", {
            name: "Expand sidebar",
          }),
        ).toBeVisible();
      }

      expect(consoleErrors, `Console errors at ${viewport.name}`).toEqual([]);
    });
  }
});

test.describe("@admin Phase 2 — auth", () => {
  test("anonymous user is redirected away from dashboard", async ({ page }) => {
    const consoleErrors = attachConsoleCollector(page);
    await clearAuthStorage(page);
    await stubAdminApis(page, null);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/auth/, { timeout: 15_000 });
    await expect(page).toHaveURL(/mode=signin/);
    await expect(page).toHaveURL(/next=%2Fdashboard/);

    expect(consoleErrors).toEqual([]);
  });

  test("normal customer cannot access dashboard", async ({ page }) => {
    const consoleErrors = attachConsoleCollector(page);
    await stubAdminApis(page, CUSTOMER_USER);
    await seedAuthStorage(page, CUSTOMER_USER);

    await openDashboardRoute(page, "/dashboard");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByText(/do not have permission/i)).toBeVisible();
    await expect(page.locator("#admin-main-content")).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });

  test("staff user can access dashboard shell", async ({ page }) => {
    const consoleErrors = attachConsoleCollector(page);
    await stubAdminApis(page, STAFF_USER);
    await seedAuthStorage(page, STAFF_USER);

    await openDashboardRoute(page, "/dashboard");
    await expectAdminShell(page);
    await expect(
      page.locator("#admin-main-content").getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("Django Admin login page is reachable", async ({ request }) => {
    test.skip(
      process.env.PLAYWRIGHT_SKIP_DJANGO_ADMIN === "1",
      "Set PLAYWRIGHT_SKIP_DJANGO_ADMIN=1 to skip when nginx is unavailable",
    );

    const candidates = [
      process.env.DJANGO_ADMIN_URL,
      "https://localhost/admin/login/",
      "http://localhost/admin/login/",
    ].filter(Boolean) as string[];

    let lastStatus = 0;
    for (const url of candidates) {
      try {
        const response = await request.get(url, {
          ignoreHTTPSErrors: true,
          timeout: 10_000,
        });
        lastStatus = response.status();
        if (response.ok()) {
          await expect(response.text()).resolves.toMatch(/Django administration|Log in/i);
          return;
        }
      } catch {
        // try next candidate
      }
    }

    test.fail(true, `Django Admin was not reachable (last status: ${lastStatus})`);
  });
});
