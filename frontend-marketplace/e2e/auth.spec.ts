/**
 * Real-browser end-to-end suite for the CUSTOMER authentication flows.
 *
 * Runs against a real Django (:8011, scratch SQLite) + Next dev (:3011) stack that is started
 * OUTSIDE Playwright - see playwright.auth.config.ts and helpers/authStack.ts. The browser only
 * ever talks to the Next origin (same-origin `/api/*`, proxied by Next rewrites).
 * Tests tagged `@mobile` also run in the iPhone-13-emulation project (Chrome engine, NOT Safari).
 *
 * Scenario numbers in the titles follow the auth-fix plan (sections 1-14).
 */
import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import {
  BASE_URL,
  STRONG_PASSWORD,
  createVerificationToken,
  createUser,
  dbState,
  deleteUser,
  emailSentAt,
  sentMailFiles,
  newestResetToken,
  newestVerificationToken,
  setUserFlags,
  uniqueEmail,
  userCount,
} from "./helpers/authStack";
import {
  REFRESH_COOKIE,
  clearAccessToken,
  collectPageErrors,
  expectSignedIn,
  expectSettledSignedOut,
  expectSignedOut,
  fillSignIn,
  fillSignUp,
  gotoAuth,
  isDesktop,
  logoutViaHeader,
  recordAuthApi,
  refreshCookie,
  seedRefreshCookie,
  sessionToken,
  signInViaUi,
  signUpViaUi,
  submitButton,
  type AuthRecorder,
} from "./helpers/authUi";

const test = base.extend<{ rec: AuthRecorder; pageErrors: string[] }>({
  rec: async ({ context }, provide) => {
    await provide(recordAuthApi(context));
  },
  pageErrors: async ({ page }, provide) => {
    await provide(collectPageErrors(page));
  },
});

test.skip(
  process.env.AUTH_E2E !== "1",
  "needs the auth E2E stack - run with: npx playwright test -c playwright.auth.config.ts"
);

const NEW_PASSWORD = "N3wPassw0rd-E2E!";
const alertWith = (page: Page, text: RegExp | string) => page.getByRole("alert").filter({ hasText: text });
const verifyingPopup = (page: Page) => page.getByRole("heading", { name: /Check Your Email|Account Created/ });

/** Direct helper for header + cookie checks after a UI sign-in. */
async function expectRefreshCookie(context: BrowserContext, page: Page) {
  const cookie = await refreshCookie(context);
  expect(cookie, "refresh_token cookie must exist").toBeTruthy();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.path).toBe("/api/auth/");
  expect(cookie!.sameSite).toBe("Lax");
  const visibleToJs = await page.evaluate(() => document.cookie);
  expect(visibleToJs).not.toContain("refresh_token");
  return cookie!;
}

/**
 * Opens the mailed verification link. Contract: verifying NEVER signs anyone in (no `access`, no
 * cookie); the page shows "Email verified" and after ~3 s redirects to
 * /auth?mode=signin&email=<email>&verified=true (plus `next` when given). Asserts all of that and
 * returns with the sign-in form on screen, e-mail prefilled, still signed out.
 */
async function openVerifyLink(page: Page, email: string, opts: { token?: string; next?: string } = {}) {
  const token = opts.token ?? newestVerificationToken(email);
  const verifyResponse = page.waitForResponse(
    (r) => r.url().includes("/api/auth/verify-email/") && r.request().method() === "POST",
    { timeout: 60_000 }
  );
  const nextQuery = opts.next ? `&next=${opts.next}` : "";
  await page.goto(`/verify-email/?token=${encodeURIComponent(token)}${nextQuery}`, { waitUntil: "commit" });
  const response = await verifyResponse;
  expect(response.status()).toBe(200);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  expect(body.access, "verify-email must not hand out an access token").toBeUndefined();
  expect((await response.headerValue("set-cookie")) ?? "").not.toContain("refresh_token");

  await page.waitForURL((u) => u.pathname.startsWith("/auth") && u.searchParams.get("verified") === "true", {
    timeout: 60_000,
  });
  const landed = new URL(page.url());
  expect(landed.searchParams.get("mode")).toBe("signin");
  expect(landed.searchParams.get("email")).toBe(email);
  await expect(page.locator("#email")).toHaveValue(email);
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();
  expect(await refreshCookie(page.context()), "no session cookie right after verify").toBeUndefined();
  expect(await sessionToken(page)).toBeFalsy();
  return { token };
}

/** Completes the sign-in form that the verify redirect left on screen (e-mail is prefilled). */
async function signInFromPrefilledForm(page: Page, password = STRONG_PASSWORD, landing: (u: URL) => boolean = (u) => u.pathname === "/") {
  await page.locator("#password").fill(password);
  await submitButton(page).click();
  await page.waitForURL(landing, { timeout: 60_000 });
}

/** Sign a fresh verified user in through the UI and land on the home page. */
async function signedInUser(page: Page, tag: string) {
  const email = uniqueEmail(tag);
  createUser({ email });
  await signInViaUi(page, email);
  await expectSignedIn(page, email);
  return email;
}

// =====================================================================================
// 1. Sign-up happy path
// =====================================================================================
test("1. sign-up -> verify link -> sign-in -> reload keeps the session (httpOnly refresh cookie) @mobile", async ({
  page,
  context,
  pageErrors,
}) => {
  const email = uniqueEmail("signup");
  await signUpViaUi(page, { email });
  await expect(page.getByRole("heading", { name: "Check Your Email" })).toBeVisible();

  const state = dbState(email);
  expect(state.users).toHaveLength(1);
  expect(state.users[0].is_email_verified).toBe(false);
  expect(state.users[0].email).toBe(email);
  expect(state.verificationTokens).toBe(1);

  // verification link from the (mailed) token: verified, but NOT signed in; lands on sign-in with the e-mail prefilled
  await openVerifyLink(page, email);
  expect(dbState(email).users[0].is_email_verified).toBe(true);
  await expect(page.getByText("Email verified successfully")).toBeVisible();

  // now sign in with the password: the session cookie appears only here
  await signInFromPrefilledForm(page);
  await expectSignedIn(page, email);
  const cookie = await expectRefreshCookie(context, page);

  // reload: session is restored through the httpOnly cookie / stored access token
  await page.reload();
  await expectSignedIn(page, email);
  const after = await refreshCookie(context);
  expect(after?.value).toBeTruthy();
  expect(cookie.value).toBeTruthy();
  expect(await sessionToken(page)).toBeTruthy();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});

// =====================================================================================
// 2. Login immediately after sign-up (unverified)
// =====================================================================================
test("2. login before verifying shows the amber notice with a persistent Resend button and a calm cooldown", async ({
  page,
  rec,
}) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("unverified");
  await signUpViaUi(page, { email });
  const signedUpAt = Date.now();
  await expect(verifyingPopup(page)).toBeVisible();

  const amberBox = () => page.getByRole("status").filter({ hasText: "Please verify your email address" });
  const resendBtn = () => page.getByRole("button", { name: "Resend verification email" });
  const signInAgain = async () => {
    await gotoAuth(page, "signin");
    await fillSignIn(page, email);
    await submitButton(page).click();
    await expect(amberBox()).toBeVisible();
    await expect(resendBtn()).toBeVisible();
  };

  // (a) straight after sign-up the mail was just sent: server cooldown -> countdown, not a scary error
  await signInAgain();
  expect(rec.calls.filter((c) => c.path.includes("/login/")).at(-1)?.status).toBe(200);
  await expectSignedOut(page);
  expect(await refreshCookie(page.context())).toBeUndefined(); // no session for an unverified account
  await resendBtn().click();
  await expect(page.getByText(/Resend available in/)).toBeVisible();
  await expect(amberBox().getByRole("alert")).toHaveCount(0);
  await expect(resendBtn()).toBeDisabled();
  expect(rec.calls.filter((c) => c.path.includes("/resend-verification/")).at(-1)?.status).toBe(429);

  // (b) once the real 60 s cooldown (DB `email_sent_at` + the enqueue guard) is over: Resend succeeds
  const remainingMs = 62_000 - (Date.now() - signedUpAt);
  if (remainingMs > 0) await page.waitForTimeout(remainingMs);
  const sentBefore = emailSentAt(email);
  const mailsBefore = sentMailFiles().length;
  await signInAgain();
  await resendBtn().click();
  await expect(amberBox().getByText(/We've sent a new link/)).toBeVisible();
  await expect(page.getByText(/Resend available in/)).toBeVisible();
  await expect(resendBtn()).toBeVisible();
  await expect(resendBtn()).toBeDisabled();
  expect(rec.calls.filter((c) => c.path.includes("/resend-verification/")).at(-1)?.status).toBe(200);
  expect(emailSentAt(email)).not.toEqual(sentBefore); // a mail was really sent, not just acknowledged
  expect(sentMailFiles().length).toBeGreaterThan(mailsBefore);

  // (c) resend again straight away (fresh page): cooldown, button still present
  await signInAgain();
  await resendBtn().click();
  await expect(page.getByText(/Resend available in/)).toBeVisible();
  await expect(amberBox().getByRole("alert")).toHaveCount(0);
  await expect(resendBtn()).toBeVisible();
  expect(rec.calls.filter((c) => c.path.includes("/resend-verification/")).at(-1)?.status).toBe(429);

  // (d) verify with the token (no session), then sign in for real
  await openVerifyLink(page, email);
  await signInFromPrefilledForm(page);
  await expectSignedIn(page, email);
});

// =====================================================================================
// 3. Email casing / whitespace
// =====================================================================================
test("3. sign-up with mixed case + padding is stored canonical; both spellings sign in @mobile", async ({
  page,
}) => {
  const canonical = `mixed.case.${Date.now().toString(36)}@example.com`;
  const messy = `  ${canonical.replace(/^./, (c) => c.toUpperCase()).replace("mixed", "MiXed").replace("@example.com", "@Example.COM")} `;
  deleteUser(canonical);

  await signUpViaUi(page, { email: messy });
  await expect(verifyingPopup(page)).toBeVisible();
  const state = dbState(canonical);
  expect(state.users).toHaveLength(1);
  expect(state.users[0].email).toBe(canonical);

  await openVerifyLink(page, canonical); // prefilled with the canonical address, no session
  await signInFromPrefilledForm(page);
  await expectSignedIn(page, canonical);
  await logoutViaHeader(page);
  await expectSignedOut(page);

  // original (messy) spelling, with the padding, still signs in to the same account
  await signInViaUi(page, messy);
  await expectSignedIn(page, canonical);
  expect(userCount(canonical)).toBe(1);
});

// =====================================================================================
// 4. Duplicate sign-up
// =====================================================================================
test("4. duplicate sign-up: resume for same password, 'already exists' actions otherwise, verified account exists", async ({
  page,
}) => {
  const email = uniqueEmail("dup");
  await signUpViaUi(page, { email });
  await expect(verifyingPopup(page)).toBeVisible();
  expect(userCount(email)).toBe(1);

  // same email + same password while unverified -> popup again, still one row
  await signUpViaUi(page, { email });
  await expect(verifyingPopup(page)).toBeVisible();
  expect(userCount(email)).toBe(1);

  // different password -> already exists + actions
  await signUpViaUi(page, { email, password: "Different1-Password!" });
  const box = alertWith(page, /already exists/i);
  await expect(box).toBeVisible();
  await expect(box.getByRole("button", { name: "Sign in instead" })).toBeVisible();
  await expect(box.getByRole("button", { name: "Reset password" })).toBeVisible();
  expect(userCount(email)).toBe(1);

  await box.getByRole("button", { name: "Sign in instead" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your account" })).toBeVisible();

  // verified account + same email (and same password) -> exists, no popup
  setUserFlags(email, { is_email_verified: true });
  await signUpViaUi(page, { email });
  await expect(alertWith(page, /already exists/i)).toBeVisible();
  await expect(verifyingPopup(page)).toHaveCount(0);
  expect(userCount(email)).toBe(1);
});

// =====================================================================================
// 5. Double click / double submit
// =====================================================================================
test("5. double-click / double-Enter on sign-up and sign-in send exactly one request", async ({ page, rec }) => {
  // sign-up: dblclick
  const email = uniqueEmail("dbl");
  await gotoAuth(page, "signup");
  await fillSignUp(page, { email });
  await submitButton(page).dblclick();
  await expect(verifyingPopup(page)).toBeVisible();
  await rec.settle();
  expect(rec.count("/api/auth/register/", "POST")).toBe(1);
  expect(userCount(email)).toBe(1);

  // sign-up: Enter twice (fresh account)
  const email2 = uniqueEmail("dbl");
  rec.reset();
  await gotoAuth(page, "signup");
  await fillSignUp(page, { email: email2 });
  await page.locator("#confirmPassword").focus();
  await Promise.all([page.keyboard.press("Enter"), page.keyboard.press("Enter")]);
  await expect(verifyingPopup(page)).toBeVisible();
  await rec.settle();
  expect(rec.count("/api/auth/register/", "POST")).toBe(1);
  expect(userCount(email2)).toBe(1);

  // sign-in: dblclick, then Enter twice
  const verified = uniqueEmail("dblin");
  createUser({ email: verified });
  rec.reset();
  await gotoAuth(page, "signin");
  await fillSignIn(page, verified);
  await submitButton(page).dblclick();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
  await rec.settle();
  expect(rec.count("/api/auth/login/", "POST")).toBe(1);
  await expectSignedIn(page, verified);

  await logoutViaHeader(page);
  await expectSignedOut(page);
  rec.reset();
  await gotoAuth(page, "signin");
  await fillSignIn(page, verified);
  await page.locator("#password").focus();
  await Promise.all([page.keyboard.press("Enter"), page.keyboard.press("Enter")]);
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
  await rec.settle();
  expect(rec.count("/api/auth/login/", "POST")).toBe(1);
});

// =====================================================================================
// 6. Wrong password / unknown email / inactive account
// =====================================================================================
test("6. wrong password, unknown email (create-account suggestion) and inactive account messages", async ({ page }) => {
  const email = uniqueEmail("msgs");
  createUser({ email });

  await gotoAuth(page, "signin");
  await fillSignIn(page, email, "Wrong-Password-1");
  await submitButton(page).click();
  await expect(alertWith(page, /Incorrect password/i)).toBeVisible();

  await gotoAuth(page, "signin");
  await fillSignIn(page, uniqueEmail("ghost"));
  await submitButton(page).click();
  const notFound = alertWith(page, /No account found/i);
  await expect(notFound).toBeVisible();
  await notFound.getByRole("button", { name: "create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  setUserFlags(email, { is_active: false });
  await gotoAuth(page, "signin");
  await fillSignIn(page, email);
  await submitButton(page).click();
  const inactive = alertWith(page, /inactive|deactivated|contact support/i);
  await expect(inactive).toBeVisible();
  await expect(inactive).not.toContainText(/incorrect password/i);
  await expect(inactive.getByRole("link", { name: "Contact support" })).toBeVisible();
});

// =====================================================================================
// 7. Reload / refresh behaviours
// =====================================================================================
test("7a. reloading a signed-in page repeatedly keeps the session @mobile", async ({ page, context, pageErrors }) => {
  const email = await signedInUser(page, "reload");
  for (let i = 0; i < 4; i += 1) {
    await page.reload();
    await expectSignedIn(page, email);
  }
  await expectRefreshCookie(context, page);
  // access token gone (new tab / expiry): still restored through the cookie
  await clearAccessToken(page);
  await page.reload();
  await expectSignedIn(page, email);
  expect(await sessionToken(page)).toBeTruthy();
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});

test("7b. a second tab opens signed in; two tabs reloading together after token expiry both survive", async ({
  page,
  context,
  rec,
}) => {
  const email = await signedInUser(page, "tabs");
  const tab2 = await context.newPage();
  await tab2.goto("/");
  await expectSignedIn(tab2, email);

  // both tabs lose their access token (=expired) and must refresh through the same cookie at once
  await clearAccessToken(page);
  await clearAccessToken(tab2);
  rec.reset();
  await Promise.all([page.reload(), tab2.reload()]);
  await expectSignedIn(page, email);
  await expectSignedIn(tab2, email);
  await rec.settle();
  const refreshes = rec.calls.filter((c) => c.path.includes("/token/refresh/"));
  expect(refreshes.length).toBeGreaterThan(0);
  expect(refreshes.map((c) => c.status)).not.toContain(401);
  expect(rec.count("/api/auth/logout/")).toBe(0);
  expect((await refreshCookie(context))?.value).toBeTruthy();

  // the cookie is still valid for a brand new tab
  const tab3 = await context.newPage();
  await tab3.goto("/");
  await expectSignedIn(tab3, email);
  await page.reload();
  await expectSignedIn(page, email);
});

test("7c. logout in one tab: the other tab is signed out once its access token is gone/expired", async ({
  page,
  context,
  rec,
}) => {
  test.skip(!isDesktop(page), "multi-tab scenario runs on desktop only");
  const email = await signedInUser(page, "xlogout");
  const tab2 = await context.newPage();
  await tab2.goto("/");
  await expectSignedIn(tab2, email);

  await logoutViaHeader(page);
  await expectSignedOut(page);
  await rec.settle();
  expect(rec.calls.filter((c) => c.path.includes("/logout/")).at(-1)?.status).toBe(200);
  expect(await refreshCookie(context)).toBeUndefined();

  // tab 2's access token would be expired by now (it lives at most 60 min): reload -> refresh -> 401 -> signed out
  await clearAccessToken(tab2);
  await tab2.reload();
  await expectSettledSignedOut(tab2);
});

test("7d. logout in one tab: the other tab, after a plain reload, is signed out (no token clearing)", async ({
  page,
  context,
}) => {
  test.skip(!isDesktop(page), "multi-tab scenario runs on desktop only");
  const email = await signedInUser(page, "xlogout2");
  const tab2 = await context.newPage();
  await tab2.goto("/");
  await expectSignedIn(tab2, email);
  await logoutViaHeader(page);
  await expectSignedOut(page);
  // BroadcastChannel / storage event should clear tab 2 without a reload.
  await expectSignedOut(tab2);
  // Reload must keep tab 2 signed out (no leftover sessionStorage access token).
  await tab2.reload({ waitUntil: "domcontentloaded" });
  await expectSignedOut(tab2);
});

// =====================================================================================
// 8. Stale / corrupted state
// =====================================================================================
test("8a. garbage refresh cookie: loads signed-out cleanly, sign-in replaces the cookie", async ({
  page,
  context,
  rec,
  pageErrors,
}) => {
  const email = uniqueEmail("garbage");
  createUser({ email });
  await page.goto("/");
  await seedRefreshCookie(context, "garbage.not.a-jwt");
  await page.reload();
  await expectSettledSignedOut(page);
  await rec.settle();
  expect(rec.count("/api/auth/logout/")).toBe(0);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);

  await signInViaUi(page, email);
  await expectSignedIn(page, email);
  const cookie = await expectRefreshCookie(context, page);
  expect(cookie.value).not.toBe("garbage.not.a-jwt");
  await page.reload();
  await expectSignedIn(page, email);
});

test("8b. garbage sessionStorage access token is repaired through the refresh cookie", async ({ page }) => {
  const email = await signedInUser(page, "badaccess");
  await page.evaluate(() => window.sessionStorage.setItem("authToken", "garbage-access-token"));
  await page.reload();
  await expectSignedIn(page, email);
  const token = await sessionToken(page);
  expect(token).toBeTruthy();
  expect(token).not.toBe("garbage-access-token");
});

test("8c. stale localStorage.user for another id with NO cookie is signed out (not an auth source)", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    window.localStorage.setItem(
      "user",
      JSON.stringify({ id: 987654, name: "Ghost User", first_name: "Ghost", email: "ghost.user@e2e-mail.test" })
    )
  );
  await page.reload();
  await expectSettledSignedOut(page);
  await expect(page.getByText("ghost.user@e2e-mail.test")).toHaveCount(0);
  expect(await sessionToken(page)).toBeFalsy();
});

// =====================================================================================
// 9. Transient failures must not log the user out
// =====================================================================================
test("9a. offline blip + visibilitychange: still signed in, cookie untouched, no /logout/ call @mobile", async ({
  page,
  context,
  rec,
}) => {
  const email = await signedInUser(page, "offline");
  const before = await refreshCookie(context);
  rec.reset();

  await context.setOffline(true);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.evaluate(() => fetch("/api/auth/profile/").catch(() => "offline")); // an authenticated call while offline
  await page.waitForTimeout(1_500);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(1_500);

  await expectSignedIn(page, email);
  expect((await refreshCookie(context))?.value).toBe(before?.value);
  await rec.settle();
  expect(rec.count("/api/auth/logout/")).toBe(0);
  await page.reload();
  await expectSignedIn(page, email);
});

test("9b. API unreachable while restoring: no logout, cookie kept, session self-heals when the API is back @mobile", async ({
  page,
  context,
  rec,
}) => {
  const email = await signedInUser(page, "apidown");
  const before = await refreshCookie(context);
  await clearAccessToken(page);
  rec.reset();

  await page.route("**/api/auth/**", (route) => route.abort("connectionrefused"));
  await page.reload();
  await page.waitForTimeout(2_000);
  await page.unroute("**/api/auth/**");
  // back online: the restore retry (timer / online / visibility trigger) heals without a reload
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expectSignedIn(page, email);

  expect((await refreshCookie(context))?.value).toBeTruthy();
  await rec.settle();
  expect(rec.count("/api/auth/logout/")).toBe(0);
  // the cookie is only ever replaced by a legitimate rotation, never dropped
  expect(before?.value).toBeTruthy();
});

test("9c. 503 on refresh with an expired access token: stays recoverable, never calls /logout/ @mobile", async ({
  page,
  context,
  rec,
}) => {
  const email = await signedInUser(page, "r503");
  const before = await refreshCookie(context);
  await clearAccessToken(page);
  rec.reset();

  await page.route("**/api/auth/token/refresh/**", (route) =>
    route.fulfill({ status: 503, contentType: "text/html", body: "<html><body>Service Unavailable</body></html>" })
  );
  const outageSeen = page.waitForResponse((r) => r.url().includes("/api/auth/token/refresh/") && r.status() === 503, {
    timeout: 30_000,
  });
  await page.reload();
  await outageSeen;
  await page.waitForTimeout(500);
  expect((await refreshCookie(context))?.value).toBe(before?.value); // untouched by the outage
  await page.unroute("**/api/auth/token/refresh/**");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expectSignedIn(page, email);
  await rec.settle();
  expect(rec.count("/api/auth/logout/")).toBe(0);
  expect(rec.calls.filter((c) => c.path.includes("/token/refresh/")).some((c) => c.status === 503)).toBe(true);
});

test("9e. access token rejected + refresh unreachable on tab focus: the session is kept, never /logout/ @mobile", async ({
  page,
  context,
  rec,
}) => {
  const email = await signedInUser(page, "r9e");
  const before = await refreshCookie(context);
  rec.reset();

  // the access token is refused (expired) AND the refresh call cannot reach the server
  await page.route("**/api/auth/profile/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Given token not valid for any token type", code: "token_not_valid" }),
    })
  );
  await page.route("**/api/auth/token/refresh/**", (route) => route.abort("internetdisconnected"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(2_000);
  await expectSignedIn(page, email); // a network blip must not sign the customer out
  await page.unroute("**/api/auth/profile/**");
  await page.unroute("**/api/auth/token/refresh/**");

  expect((await refreshCookie(context))?.value).toBe(before?.value);
  await rec.settle();
  expect(rec.count("/api/auth/logout/")).toBe(0);
  expect(rec.calls.some((c) => c.path.includes("/token/refresh/") && c.failed)).toBe(true);
  await page.reload();
  await expectSignedIn(page, email);
});

test("9d. 401 on refresh signs out locally WITHOUT calling /logout/", async ({ page, rec }) => {
  const email = await signedInUser(page, "r401");
  void email;
  await clearAccessToken(page);
  rec.reset();
  await page.route("**/api/auth/token/refresh/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Token is invalid or expired", code: "token_not_valid" }),
    })
  );
  await page.reload();
  await expectSettledSignedOut(page);
  await rec.settle();
  expect(rec.count("/api/auth/logout/")).toBe(0);
  expect(rec.calls.filter((c) => c.path.includes("/token/refresh/")).some((c) => c.status === 401)).toBe(true);
});

// =====================================================================================
// 10. Logout / login cycle x3
// =====================================================================================
test("10. logout/login cycle x3 clears the cookie every time and login keeps working", async ({
  page,
  context,
  rec,
}) => {
  const email = uniqueEmail("cycle");
  createUser({ email });
  for (let i = 0; i < 3; i += 1) {
    await signInViaUi(page, email);
    await expectSignedIn(page, email);
    expect(await refreshCookie(context)).toBeTruthy();

    rec.reset();
    await logoutViaHeader(page);
    await expectSignedOut(page);
    await rec.settle();
    const logout = rec.calls.filter((c) => c.path.includes("/logout/")).at(-1);
    expect(logout?.status).toBe(200);
    expect(logout?.setCookie ?? "").toMatch(/refresh_token=(""|);/);
    expect(logout?.setCookie ?? "").toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
    expect(await refreshCookie(context)).toBeUndefined();

    // the refresh probe is now unauthorised
    const csrf = await (await context.request.get("/api/auth/csrf-token/")).json();
    const probe = await context.request.post("/api/auth/token/refresh/", {
      headers: { "X-CSRFToken": csrf.csrfToken ?? csrf.csrf_token ?? "", "Content-Type": "application/json" },
      data: {},
    });
    expect(probe.status()).toBe(401);
  }
});

// =====================================================================================
// 11. Error UX with faked failures on the real UI
// =====================================================================================
test.describe("11. error UX", () => {
  test("11a. 429 rate_limited: friendly message, disabled submit with countdown, then re-enabled", async ({ page }) => {
    const email = uniqueEmail("rl");
    createUser({ email });
    await page.route("**/api/auth/login/**", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "5", "X-Request-ID": "e2e-rate-limit-0001" },
        body: JSON.stringify({
          error: "Too many requests",
          detail: "Too many requests",
          code: "rate_limited",
          retry_after: 5,
        }),
      })
    );
    await gotoAuth(page, "signin");
    await fillSignIn(page, email);
    await submitButton(page).click();
    await expect(alertWith(page, /Too many attempts/i)).toBeVisible();
    await expect(submitButton(page)).toBeDisabled();
    await expect(submitButton(page)).toContainText(/Try again in/i);
    await expect(alertWith(page, /Too many attempts/i)).not.toContainText(/429/);
    await expect(submitButton(page)).toBeEnabled({ timeout: 15_000 });
    await expect(submitButton(page)).toContainText("Sign in");
  });

  test("11b. HTML 502/503 pages become a friendly 'try again' message with the reference id when present", async ({
    page,
  }) => {
    const email = uniqueEmail("html5xx");
    createUser({ email });
    await page.route("**/api/auth/login/**", (route) =>
      route.fulfill({
        status: 502,
        contentType: "text/html",
        headers: { "X-Request-ID": "e2e-bad-gateway-0002" },
        body: "<html><head><title>502 Bad Gateway</title></head><body><h1>502 Bad Gateway</h1>nginx</body></html>",
      })
    );
    await gotoAuth(page, "signin");
    await fillSignIn(page, email);
    await submitButton(page).click();
    const box = alertWith(page, /try again/i);
    await expect(box).toBeVisible();
    await expect(box).not.toContainText(/HTTP 50\d|Bad Gateway|<html/i);
    await expect(box).toContainText("e2e-bad-gateway-0002");

    await page.unroute("**/api/auth/login/**");
    await page.route("**/api/auth/login/**", (route) =>
      route.fulfill({ status: 503, contentType: "text/html", body: "<html><body>Service Unavailable</body></html>" })
    );
    await submitButton(page).click();
    const box2 = alertWith(page, /try again/i);
    await expect(box2).toBeVisible();
    await expect(box2).not.toContainText(/HTTP 50\d|Service Unavailable|Reference:/i);
  });

  test("11c. aborted request shows the network message", async ({ page }) => {
    const email = uniqueEmail("abort");
    createUser({ email });
    await page.route("**/api/auth/login/**", (route) => route.abort("failed"));
    await gotoAuth(page, "signin");
    await fillSignIn(page, email);
    await submitButton(page).click();
    await expect(alertWith(page, /Network error|check your connection/i)).toBeVisible();
    await expect(submitButton(page)).toBeEnabled();
  });

  test("11d. slow register (>10 s) times out gracefully, and re-submitting resumes the created account", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("slow");
    await page.route("**/api/auth/register/**", async (route) => {
      const response = await route.fetch(); // the real backend creates the account...
      await new Promise((resolve) => setTimeout(resolve, 12_000)); // ...but the answer arrives too late
      await route.fulfill({ response }).catch(() => undefined);
    });
    await gotoAuth(page, "signup");
    await fillSignUp(page, { email });
    await submitButton(page).click();
    await expect(alertWith(page, /took too long|timed out/i)).toBeVisible({ timeout: 30_000 });
    expect(userCount(email)).toBe(1); // backend did create it
    await expect(submitButton(page)).toBeEnabled();

    await page.unroute("**/api/auth/register/**");
    await submitButton(page).click();
    // resume: the same details continue the sign-up (popup) instead of dead-ending on "already exists"
    await expect(verifyingPopup(page)).toBeVisible({ timeout: 20_000 });
    expect(userCount(email)).toBe(1);
  });
});

// =====================================================================================
// 12. Password reset for an UNVERIFIED account
// =====================================================================================
test("12. password reset on an unverified account verifies it and the new password signs in", async ({
  page,
  context,
}) => {
  const email = uniqueEmail("resetunv");
  createUser({ email, verified: false });

  await page.goto("/auth/?forgotPassword=true");
  await page.locator("#forgot-email").fill(email);
  await page.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(page.getByText(/reset link|check your email/i).first()).toBeVisible();

  await page.goto(`/reset-password/?token=${encodeURIComponent(newestResetToken(email))}`);
  await page.locator("#newPassword").fill(NEW_PASSWORD);
  await page.locator("#confirmPassword").fill(NEW_PASSWORD);
  await page.locator("form button[type=submit]").click();
  await expect(page.getByRole("heading", { name: "Password Reset Successful!" })).toBeVisible();
  expect(dbState(email).users[0].is_email_verified).toBe(true);

  await signInViaUi(page, email, NEW_PASSWORD);
  await expectSignedIn(page, email);
  await expectRefreshCookie(context, page);
  // the old password no longer works
  await logoutViaHeader(page);
  await gotoAuth(page, "signin");
  await fillSignIn(page, email, STRONG_PASSWORD);
  await submitButton(page).click();
  await expect(alertWith(page, /Incorrect password/i)).toBeVisible();
});

// =====================================================================================
// 14. Observability: X-Request-ID + no-store on every /api/auth/* response
// =====================================================================================
test("14. every /api/auth/* response carries X-Request-ID and Cache-Control: no-store", async ({
  page,
  context,
  rec,
}) => {
  const email = uniqueEmail("obs");
  createUser({ email });
  const unverified = uniqueEmail("obsunv");
  createUser({ email: unverified, verified: false });

  // a spread of endpoints, successes and failures
  await gotoAuth(page, "signin");
  await fillSignIn(page, email, "Wrong-Password-1");
  await submitButton(page).click();
  await expect(alertWith(page, /Incorrect password/i)).toBeVisible();
  await fillSignIn(page, unverified);
  await submitButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Please verify your email address" })).toBeVisible();
  await page.getByRole("button", { name: "Resend verification email" }).click();
  await page.waitForTimeout(1_000);
  await signInViaUi(page, email);
  await expectSignedIn(page, email);
  await clearAccessToken(page);
  await page.reload(); // refresh
  await expectSignedIn(page, email);
  await context.request.get("/api/auth/csrf-token/");
  await logoutViaHeader(page);
  await expectSignedOut(page);
  await page.goto(`/verify-email/?token=${"x".repeat(40)}`);
  await page.waitForTimeout(1_000);

  await rec.settle();
  const seen = rec.calls.filter((c) => c.status !== undefined);
  const paths = new Set(seen.map((c) => c.path));
  for (const wanted of ["/login/", "/token/refresh/", "/logout/", "/resend-verification/", "/verify-email/"]) {
    expect([...paths].some((p) => p.includes(wanted)), `expected a ${wanted} call`).toBe(true);
  }
  const missing = seen
    .filter((c) => !c.requestId || !/no-store/i.test(c.cacheControl ?? ""))
    .map((c) => `${c.method} ${c.path} -> ${c.status} rid=${c.requestId ?? "-"} cc=${c.cacheControl ?? "-"}`);
  expect(missing, missing.join("\n")).toEqual([]);
  expect(REFRESH_COOKIE).toBe("refresh_token");
});

// =====================================================================================
// 15. Open redirect via ?next=
// =====================================================================================
test("15. sign-in never redirects off-origin for hostile ?next= values (backslash / control characters)", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const origin = new URL(BASE_URL).origin;
  const email = uniqueEmail("redir");
  createUser({ email });
  const evilRequests: string[] = [];
  await context.route((url) => url.hostname === "evil.com", (route) => {
    evilRequests.push(route.request().url());
    return route.abort();
  });

  // hostile payloads: "/\evil.com" and "/<TAB>/evil.com" (browsers read both as //evil.com)
  for (const next of ["%2F%5Cevil.com", "/%09/evil.com", "%2F%5C%5Cevil.com", "//evil.com", "https://evil.com"]) {
    await gotoAuth(page, "signin", `&next=${next}`);
    await fillSignIn(page, email);
    await submitButton(page).click();
    await page.waitForURL((u) => u.origin === origin && u.pathname === "/", { timeout: 30_000 });
    expect(new URL(page.url()).origin, `next=${next}`).toBe(origin);
    expect(evilRequests, `next=${next} must never navigate to another host`).toEqual([]);
    await expectSignedIn(page, email);
    await logoutViaHeader(page);
    await expectSignedOut(page);
  }

  // control: a legitimate same-origin next is still honoured
  await gotoAuth(page, "signin", "&next=%2Fcart%2F");
  await fillSignIn(page, email);
  await submitButton(page).click();
  await page.waitForURL((u) => u.origin === origin && u.pathname.startsWith("/cart"), {
    waitUntil: "commit", // /cart is compiled on demand by next dev (slow first hit)
    timeout: 60_000,
  });
});

// =====================================================================================
// 16. Password reset ends the old session (other browser)
// =====================================================================================
test("16. resetting the password in another browser ends the old session on the next refresh", async ({
  page,
  browser,
  context,
  rec,
}) => {
  test.skip(!isDesktop(page), "two-context scenario runs on desktop only");
  const email = uniqueEmail("resetkill");
  createUser({ email });
  await signInViaUi(page, email);
  await expectSignedIn(page, email);
  const oldCookie = await refreshCookie(context);
  expect(oldCookie?.value).toBeTruthy();

  // context B (another device): forgot password -> reset link -> new password
  const contextB = await browser.newContext({ baseURL: BASE_URL });
  try {
    const pageB = await contextB.newPage();
    await pageB.goto("/auth/?forgotPassword=true");
    await pageB.locator("#forgot-email").fill(email);
    await pageB.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(pageB.getByText(/reset link|check your email/i).first()).toBeVisible();
    await pageB.goto(`/reset-password/?token=${encodeURIComponent(newestResetToken(email))}`);
    await pageB.locator("#newPassword").fill(NEW_PASSWORD);
    await pageB.locator("#confirmPassword").fill(NEW_PASSWORD);
    await pageB.locator("form button[type=submit]").click();
    await expect(pageB.getByRole("heading", { name: "Password Reset Successful!" })).toBeVisible();
    await signInViaUi(pageB, email, NEW_PASSWORD); // the new password works on the other device
    await expectSignedIn(pageB, email);
  } finally {
    await contextB.close();
  }

  // context A: the old refresh cookie is dead. Its short-lived access token may still carry the tab
  // until it expires (stateless JWT) - record what a plain reload does, then force the refresh.
  test.setTimeout(240_000);
  rec.reset();
  await page.reload();
  const plainReloadStaysSignedIn = await page
    .getByRole("button", { name: "User menu" })
    .waitFor({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  test.info().annotations.push({
    type: "observed",
    description: `plain reload with a still-valid access token: ${plainReloadStaysSignedIn ? "stays signed in (JWT valid <= 60 min)" : "signed out"}`,
  });

  await rec.settle();
  const phase1 = rec.calls.map((c) => `${c.method} ${c.path} ${c.status ?? c.failed ?? "?"}`).join("; ");
  await clearAccessToken(page); // = the access token expired
  rec.reset();
  const refreshAnswered = page.waitForResponse((r) => r.url().includes("/api/auth/token/refresh/"), { timeout: 30_000 });
  await page.reload();
  await refreshAnswered;
  await expectSettledSignedOut(page);
  await rec.settle();
  const refresh = rec.calls.filter((c) => c.path.includes("/token/refresh/"));
  const trail = `plain-reload calls: [${phase1}]; expired-token calls: [${rec.calls.map((c) => `${c.method} ${c.path} ${c.status ?? "?"}`).join("; ")}]`;
  expect(refresh.length, trail).toBeGreaterThan(0);
  expect(refresh.map((c) => c.status)).toContain(401);
  expect(rec.count("/api/auth/logout/")).toBe(0);
  expect(await sessionToken(page)).toBeFalsy();

  // and the old password is dead, the new one signs in here too
  await signInViaUi(page, email, NEW_PASSWORD);
  await expectSignedIn(page, email);
});

// =====================================================================================
// 17. Verify never signs anyone in: replayed link in a fresh browser; `next` survives
// =====================================================================================
test("17. a replayed verify link never creates a session; a fresh browser only reaches the sign-in form", async ({
  page,
  browser,
}) => {
  test.skip(!isDesktop(page), "two-context scenario runs on desktop only");
  const email = uniqueEmail("replay");
  createUser({ email, verified: false });
  const token = createVerificationToken(email);

  await openVerifyLink(page, email, { token }); // first use: verifies, no session
  expect(dbState(email).users[0].is_email_verified).toBe(true);

  // attacker / other device replays the very same link in a clean browser
  const contextB = await browser.newContext({ baseURL: BASE_URL });
  try {
    const recB = recordAuthApi(contextB);
    const pageB = await contextB.newPage();
    const answered = pageB.waitForResponse((r) => r.url().includes("/api/auth/verify-email/"), { timeout: 60_000 });
    await pageB.goto(`/verify-email/?token=${encodeURIComponent(token)}`, { waitUntil: "commit" });
    const replay = await answered;
    const replayBody = (await replay.json().catch(() => ({}))) as Record<string, unknown>;
    expect(replayBody.access, "replayed verify link must not return an access token").toBeUndefined();
    expect((await replay.headerValue("set-cookie")) ?? "").not.toContain("refresh_token");
    await pageB.waitForURL((u) => u.pathname.startsWith("/auth"), { timeout: 60_000 }).catch(() => undefined);
    await pageB.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await recB.settle();
    expect(await refreshCookie(contextB), "replay must not set a session cookie").toBeUndefined();
    expect(recB.calls.filter((c) => c.path.includes("/login/") || (c.path.includes("/token/refresh/") && c.status === 200))).toEqual([]);
    await expectSignedOut(pageB);
  } finally {
    await contextB.close();
  }
});

test("18. verify link with ?next=/cart lands on sign-in and, after signing in, on /cart", async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("verifynext");
  createUser({ email, verified: false });
  await openVerifyLink(page, email, { token: createVerificationToken(email), next: "%2Fcart" });
  expect(new URL(page.url()).searchParams.get("next")).toBe("/cart");
  await signInFromPrefilledForm(page, STRONG_PASSWORD, (u) => u.pathname.startsWith("/cart"));
  expect(new URL(page.url()).origin).toBe(new URL(BASE_URL).origin);
});
