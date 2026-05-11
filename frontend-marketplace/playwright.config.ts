import { defineConfig, devices } from "@playwright/test";

const PLAYWRIGHT_SHOP_PORT = process.env.PLAYWRIGHT_SHOP_PORT ?? "3005";
const defaultBaseURL = `http://127.0.0.1:${PLAYWRIGHT_SHOP_PORT}`;

/**
 * Spins up `next dev` on port 3005 by default so tests don’t collide with whatever is on :3000.
 * Override URL: PLAYWRIGHT_BASE_URL=https://localhost:3443 npm run test:e2e
 * Skip auto server: PLAYWRIGHT_SKIP_WEB_SERVER=1 npm run test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  ...(process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "1"
    ? {}
    : {
        webServer: {
          command: `npm run dev -- -p ${PLAYWRIGHT_SHOP_PORT}`,
          url: defaultBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: "pipe",
          stderr: "pipe",
        },
      }),
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ??
      process.env.NEXT_PUBLIC_E2E_BASE_URL ??
      defaultBaseURL,
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
