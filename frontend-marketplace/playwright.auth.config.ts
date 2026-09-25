import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser auth E2E (customer sign-up / sign-in / session restore).
 *
 * The stack is started OUTSIDE Playwright (no `webServer` block) - see e2e/auth-stack/README.txt:
 *   e2e/auth-stack/start_stack.sh --fresh-db   # Django :8011 (scratch SQLite) + `next dev` :3011
 *   npx playwright test -c playwright.auth.config.ts
 *   e2e/auth-stack/stop_stack.sh
 * Uses the system Google Chrome (`channel: "chrome"`), nothing is downloaded. The "mobile" project is
 * Chrome with iPhone-13 emulation (viewport/touch/UA) - it is NOT real Safari/WebKit.
 * Override the origin with AUTH_E2E_BASE_URL. `auth.spec.ts` skips itself unless AUTH_E2E=1, so the
 * default `npm run test:e2e` (playwright.config.ts, testDir "e2e") never runs it.
 */
process.env.AUTH_E2E = "1"; // set before the spec loads (workers inherit it)

const baseURL = process.env.AUTH_E2E_BASE_URL ?? "http://127.0.0.1:3011";

// iPhone 13 emulation on Chromium (the preset targets WebKit; drop its defaultBrowserType).
const { defaultBrowserType: _ignored, ...iphone13 } = devices["iPhone 13"];
void _ignored;

export default defineConfig({
  testDir: "e2e",
  testMatch: "auth.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 30_000 }, // generous: `next dev` compiles routes on demand

  reporter: [["list"]],
  outputDir: process.env.AUTH_E2E_OUTPUT_DIR ?? "test-results/auth-e2e",
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1280, height: 900 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile-chrome-iphone13",
      grep: /@mobile/, // single-tab scenarios 1, 3, 7a and 9 (see auth.spec.ts)
      use: { ...iphone13, channel: "chrome", browserName: "chromium" },
    },
  ],
});
