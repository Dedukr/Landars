/**
 * Browser-side helpers for `e2e/auth.spec.ts`: page actions, header state, cookie/storage
 * inspection and an `/api/auth/*` traffic recorder. Nothing here logs secrets.
 */
import { expect, type BrowserContext, type Cookie, type Page, type Response } from "@playwright/test";
import { STRONG_PASSWORD } from "./authStack";

export const REFRESH_COOKIE = "refresh_token";

// ---------------------------------------------------------------- traffic recorder
export interface ApiCall {
  method: string;
  path: string; // e.g. /api/auth/login/
  url: string;
  status?: number;
  requestId?: string | null;
  cacheControl?: string | null;
  setCookie?: string | null;
  failed?: string; // requestfailed error text (offline, aborted, ...)
}

export interface AuthRecorder {
  calls: ApiCall[];
  /** Await pending response-header reads; call before asserting on `calls`. */
  settle(): Promise<void>;
  count(pathPart: string, method?: string): number;
  reset(): void;
}

/** Records every `/api/auth/*` request/response seen by any page of the context. */
export function recordAuthApi(context: BrowserContext): AuthRecorder {
  const calls: ApiCall[] = [];
  const byRequest = new Map<unknown, ApiCall>();
  const pending: Promise<void>[] = [];

  context.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/auth/")) return;
    const call: ApiCall = { method: request.method(), path: url.pathname, url: request.url() };
    byRequest.set(request, call);
    calls.push(call);
  });
  context.on("response", (response: Response) => {
    const call = byRequest.get(response.request());
    if (!call) return;
    call.status = response.status();
    pending.push(
      response
        .allHeaders()
        .then((h) => {
          call.requestId = h["x-request-id"] ?? null;
          call.cacheControl = h["cache-control"] ?? null;
          call.setCookie = h["set-cookie"] ?? null;
        })
        .catch(() => undefined)
    );
  });
  context.on("requestfailed", (request) => {
    const call = byRequest.get(request);
    if (call) call.failed = request.failure()?.errorText ?? "failed";
  });

  return {
    calls,
    async settle() {
      await Promise.all(pending.splice(0));
    },
    count(pathPart, method) {
      return calls.filter((c) => c.path.includes(pathPart) && (!method || c.method === method)).length;
    },
    reset() {
      calls.length = 0;
    },
  };
}

// ---------------------------------------------------------------- viewport helpers
export function isDesktop(page: Page): boolean {
  const width = page.viewportSize()?.width ?? 1280;
  return width >= 1024; // Tailwind `lg`, where the header switches between desktop and mobile menus
}

// ---------------------------------------------------------------- page-error collector
/** Uncaught page errors + console errors (browser "Failed to load resource" lines are ignored). */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    const msg = e.message;
    // WebKit + Next turbopack: CORS noise on stack-frame / HMR endpoints, not auth bugs.
    if (/access control checks/i.test(msg)) return;
    if (/Failed to load chunk/i.test(msg)) return;
    errors.push(`pageerror: ${msg}`);
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (/Failed to load resource|net::ERR|the server responded with a status/i.test(text)) return;
    // Safari "Load failed" on cart/wishlist/CSRF during reload is the known turbopack/WebKit
    // flake class; auth paths already treat it as a transient network error in product code.
    if (/TypeError: Load failed/i.test(text)) return;
    errors.push(`console.error: ${text.slice(0, 200)}`);
  });
  return errors;
}

// ---------------------------------------------------------------- header / signed-in state
async function setMobileMenu(page: Page, open: boolean) {
  const toggle = page.getByRole("button", { name: "Toggle menu" });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== String(open)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", String(open));
}

/** Asserts the header shows a signed-in account (desktop: user menu; mobile: menu lists the email). */
export async function expectSignedIn(page: Page, email?: string): Promise<void> {
  if (isDesktop(page)) {
    await expect(page.getByRole("button", { name: "User menu" })).toBeVisible();
    return;
  }
  await setMobileMenu(page, true);
  await expect(page.getByRole("button", { name: "Log Out" })).toBeVisible();
  if (email) await expect(page.getByText(email, { exact: true })).toBeVisible();
  await setMobileMenu(page, false);
}

/** Asserts the header offers "Sign In" (signed out). */
export async function expectSignedOut(page: Page): Promise<void> {
  if (isDesktop(page)) {
    await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("button", { name: "User menu" })).toHaveCount(0);
    return;
  }
  await setMobileMenu(page, true);
  await expect(page.getByRole("link", { name: "Sign In" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log Out" })).toHaveCount(0);
  await setMobileMenu(page, false);
}

/**
 * Signed-out UI that has SETTLED: the header shows "Sign In" while the session restore is still in
 * flight, so wait for the network to go quiet and re-check (a late restore/refresh must not flip it).
 */
export async function expectSettledSignedOut(page: Page): Promise<void> {
  await expectSignedOut(page);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  await expectSignedOut(page);
}

/** Header "Log Out" (desktop dropdown / mobile menu). */
export async function logoutViaHeader(page: Page): Promise<void> {
  if (isDesktop(page)) {
    await page.getByRole("button", { name: "User menu" }).click();
  } else {
    await setMobileMenu(page, true);
  }
  await page.getByRole("button", { name: "Log Out" }).click();
  // the header closes its menu only after the server logout call has settled
  if (!isDesktop(page)) {
    await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveAttribute("aria-expanded", "false");
  }
  // Wait until UI is signed out. Prefer waiting for the httpOnly cookie to clear so
  // a follow-up /auth navigation does not bounce home (WebKit race); don't hang the
  // suite if the cookie probe is slow.
  await expectSignedOut(page);
  try {
    await expect
      .poll(async () => (await refreshCookie(page.context())) ?? null, { timeout: 5_000 })
      .toBeNull();
  } catch {
    // Cookie clear is best-effort; callers that need a hard guarantee can poll themselves.
  }
}

// ---------------------------------------------------------------- auth page actions
export interface SignUpInput {
  firstName?: string;
  surname?: string;
  email: string;
  password?: string;
  confirmPassword?: string;
}

export async function gotoAuth(page: Page, mode: "signin" | "signup", extra = ""): Promise<void> {
  // WebKit: if a prior logout's cookie clear races, /auth may bounce to /. Retry once after
  // waiting for signed-out UI so the form can hydrate.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(`/auth/?mode=${mode}${extra}`, { waitUntil: "domcontentloaded" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 0 && /interrupted by another navigation/i.test(msg)) {
        await expectSignedOut(page);
        continue;
      }
      throw err;
    }
    break;
  }
  await expect(page.locator("#email")).toBeVisible();
  // form hydrated? (React attaches handlers after hydration; the heading flips with `mode`)
  await expect(page.getByRole("heading", { name: mode === "signup" ? "Create your account" : "Sign in to your account" })).toBeVisible();
}

export async function fillSignUp(page: Page, input: SignUpInput): Promise<void> {
  await page.locator("#first_name").fill(input.firstName ?? "Ada");
  await page.locator("#surname").fill(input.surname ?? "Tester");
  await page.locator("#email").fill(input.email);
  await page.locator("#password").fill(input.password ?? STRONG_PASSWORD);
  await page.locator("#confirmPassword").fill(input.confirmPassword ?? input.password ?? STRONG_PASSWORD);
}

export function submitButton(page: Page) {
  return page.locator("form button[type=submit]");
}

export async function signUpViaUi(page: Page, input: SignUpInput): Promise<void> {
  await gotoAuth(page, "signup");
  await fillSignUp(page, input);
  await submitButton(page).click();
}

export async function fillSignIn(page: Page, email: string, password = STRONG_PASSWORD): Promise<void> {
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
}

/** Sign in through the form and wait until the app has redirected home. */
export async function signInViaUi(page: Page, email: string, password = STRONG_PASSWORD): Promise<void> {
  await gotoAuth(page, "signin");
  await fillSignIn(page, email, password);
  await submitButton(page).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
}

export function popup(page: Page) {
  return page.getByRole("heading", { name: /Check Your Email|Account Created/ });
}

// ---------------------------------------------------------------- cookies / storage
export async function refreshCookie(context: BrowserContext): Promise<Cookie | undefined> {
  return (await context.cookies()).find((c) => c.name === REFRESH_COOKIE);
}

export async function seedRefreshCookie(context: BrowserContext, value: string): Promise<void> {
  const cookie = await refreshCookie(context);
  await context.addCookies([
    {
      name: REFRESH_COOKIE,
      value,
      domain: cookie?.domain ?? "127.0.0.1",
      path: "/api/auth/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

export async function sessionToken(page: Page): Promise<string | null> {
  return page.evaluate(() => window.sessionStorage.getItem("authToken"));
}

export async function clearAccessToken(page: Page): Promise<void> {
  await page.evaluate(() => window.sessionStorage.removeItem("authToken"));
}
