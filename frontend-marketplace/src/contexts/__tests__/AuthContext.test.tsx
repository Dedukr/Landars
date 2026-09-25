import "@testing-library/jest-dom";
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../AuthContext";
import { clearAccessToken, getAccessToken, setAccessToken, AUTH_LOGOUT_AT_KEY } from "@/utils/authTokenStore";
import { resetCSRFToken } from "@/utils/httpClient";
import { reportAuthClientEvent } from "@/utils/authTelemetry";

// Telemetry is best-effort and uses fetch/sendBeacon itself; assert what would be reported.
jest.mock("@/utils/authTelemetry", () => ({ reportAuthClientEvent: jest.fn() }));
const mockReport = reportAuthClientEvent as jest.Mock;

// ---------------------------------------------------------------------------
// fetch mock routed by URL: profile / refresh / csrf / logout
// ---------------------------------------------------------------------------
type MockRes = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
};

function mockRes(status: number, body: unknown = {}): MockRes {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    json: async () => body,
  };
}

type Responder = (init?: RequestInit) => MockRes | Promise<MockRes>;
type RouteName = "profile" | "refresh" | "csrf" | "logout";

const routes: Record<RouteName, Responder[]> = {
  profile: [],
  refresh: [],
  csrf: [],
  logout: [],
};

/** Successive responses; the last one repeats once the queue is down to one. */
function nextResponder(queue: Responder[]): Responder {
  if (queue.length === 0) throw new Error("no mocked response configured");
  return queue.length > 1 ? (queue.shift() as Responder) : queue[0];
}

function routeOf(url: string): RouteName | null {
  if (url.includes("/api/auth/profile/")) return "profile";
  if (url.includes("/api/auth/token/refresh/")) return "refresh";
  if (url.includes("/api/auth/csrf-token/")) return "csrf";
  if (url.includes("/api/auth/logout/")) return "logout";
  return null;
}

const mockFetch = jest.fn();

async function router(input: RequestInfo | URL, init?: RequestInit) {
  const name = routeOf(String(input));
  if (!name) throw new Error(`unexpected fetch: ${String(input)}`);
  return nextResponder(routes[name])(init);
}

const callsTo = (name: RouteName) =>
  mockFetch.mock.calls.filter(([url]) => routeOf(String(url)) === name).length;

const abortError = () =>
  Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

/** Never answers; rejects with AbortError when the request's signal aborts (timeout). */
const hang: Responder = (init) =>
  new Promise<MockRes>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(abortError()));
  });

function deferredResponder() {
  let resolve!: (response: MockRes) => void;
  const promise = new Promise<MockRes>((res) => {
    resolve = res;
  });
  return { responder: (() => promise) as Responder, resolve };
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------
const ADA = {
  id: 1,
  first_name: "Ada",
  surname: "Lovelace",
  email: "ada@example.com",
  is_staff: false,
};
const BOB = { id: 2, first_name: "Bob", surname: "Builder", email: "bob@example.com" };

const profileOk = (user: Record<string, unknown> = ADA): Responder => () =>
  mockRes(200, { user });
const respond =
  (status: number, body: unknown = {}): Responder =>
  () =>
    mockRes(status, body);
const networkDown: Responder = () => {
  throw new TypeError("Load failed");
};
const refreshOk =
  (access = "access-2"): Responder =>
  () =>
    mockRes(200, { access });
/** Profile is only valid for one specific access token (a real backend does the same). */
const profileValidFor =
  (validToken: string, user: Record<string, unknown> = ADA): Responder =>
  (init) =>
    new Headers(init?.headers).get("Authorization") === `Bearer ${validToken}`
      ? mockRes(200, { user })
      : mockRes(401, { detail: "token_not_valid" });

function seedRoutes(overrides: Partial<Record<RouteName, Responder[]>> = {}) {
  routes.profile = overrides.profile ?? [profileOk()];
  routes.refresh = overrides.refresh ?? [respond(401)];
  routes.csrf = overrides.csrf ?? [() => mockRes(200, { csrfToken: "csrf-1" })];
  routes.logout = overrides.logout ?? [respond(200, { message: "Logout successful" })];
}

// ---------------------------------------------------------------------------
// component under test
// ---------------------------------------------------------------------------
let auth: ReturnType<typeof useAuth>;

function Probe() {
  auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="user">{auth.user?.email ?? "none"}</span>
      <span data-testid="token">{auth.token ?? "none"}</span>
    </div>
  );
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

const text = (testId: string) => screen.getByTestId(testId).textContent;
const flushReal = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
const setTabVisible = () => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

async function signIn(access = "access-1") {
  setAccessToken(access);
  localStorage.setItem("user", JSON.stringify(ADA));
  seedRoutes({ profile: [profileOk()] });
  renderProvider();
  await waitFor(() => expect(text("user")).toBe(ADA.email));
  mockFetch.mockClear();
  mockReport.mockClear();
}

describe("AuthProvider session handling", () => {
  let userLogoutEvents = 0;
  const onUserLogout = () => {
    userLogoutEvents += 1;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockFetch.mockImplementation(router);
    global.fetch = mockFetch as unknown as typeof fetch;
    localStorage.clear();
    sessionStorage.clear();
    clearAccessToken();
    resetCSRFToken();
    seedRoutes();
    userLogoutEvents = 0;
    window.addEventListener("user:logout", onUserLogout);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // React state updates must stay inside act(): those warnings are swallowed by the
    // console.error spy above, so assert on them explicitly.
    const actWarnings = (console.error as jest.Mock).mock.calls.filter(([message]) =>
      String(message).includes("not wrapped in act")
    );
    window.removeEventListener("user:logout", onUserLogout);
    jest.useRealTimers();
    jest.restoreAllMocks();
    expect(actWarnings).toHaveLength(0);
  });

  describe("restore on mount", () => {
    test("valid stored access token restores the session without refreshing", async () => {
      setAccessToken("access-1");
      seedRoutes({ profile: [profileOk()] });

      renderProvider();

      await waitFor(() => expect(text("user")).toBe(ADA.email));
      expect(text("loading")).toBe("false");
      expect(text("token")).toBe("access-1");
      expect(callsTo("refresh")).toBe(0);
      expect(callsTo("logout")).toBe(0);
      expect(JSON.parse(localStorage.getItem("user") as string).email).toBe(ADA.email);
      expect(getAccessToken()).toBe("access-1");
    });

    test("expired access token + successful refresh restores the session", async () => {
      setAccessToken("access-old");
      seedRoutes({
        profile: [profileValidFor("access-2")],
        refresh: [refreshOk("access-2")],
      });

      renderProvider();

      await waitFor(() => expect(text("user")).toBe(ADA.email));
      expect(text("token")).toBe("access-2");
      expect(getAccessToken()).toBe("access-2");
      expect(callsTo("profile")).toBe(2); // old token rejected, new token accepted
      expect(callsTo("refresh")).toBe(1);
      expect(callsTo("logout")).toBe(0);
    });

    test("cookie-only session (no access token): refresh probe restores it", async () => {
      seedRoutes({
        profile: [profileValidFor("access-2")],
        refresh: [refreshOk("access-2")],
      });

      renderProvider();

      await waitFor(() => expect(text("user")).toBe(ADA.email));
      expect(getAccessToken()).toBe("access-2");
      expect(callsTo("logout")).toBe(0);
    });

    test("REJECTED at restore clears local state and does NOT call the server logout", async () => {
      setAccessToken("access-old");
      localStorage.setItem("user", JSON.stringify(ADA));
      localStorage.setItem("wishlist", "[1]");
      localStorage.setItem("auth_wishlist_v1_1", "[1]");
      seedRoutes({ profile: [respond(401)], refresh: [respond(401, { detail: "Token is blacklisted" })] });

      renderProvider();

      await waitFor(() => expect(text("loading")).toBe("false"));
      await flushReal();
      expect(text("user")).toBe("none");
      expect(text("token")).toBe("none");
      expect(getAccessToken()).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
      expect(localStorage.getItem("wishlist")).toBeNull();
      expect(userLogoutEvents).toBeGreaterThanOrEqual(1);
      // The refresh cookie is NOT blacklisted/cleared by the client.
      expect(callsTo("logout")).toBe(0);
      expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toBeTruthy();
    });

    test("anonymous visitor: rejected cookie probe only drops a stale cached profile", async () => {
      localStorage.setItem("user", JSON.stringify(ADA));
      localStorage.setItem("guest_wishlist", "[3]");
      seedRoutes({ refresh: [respond(401)] });

      renderProvider();

      await waitFor(() => expect(text("loading")).toBe("false"));
      await flushReal();
      expect(localStorage.getItem("user")).toBeNull();
      expect(localStorage.getItem("guest_wishlist")).toBe("[3]");
      expect(userLogoutEvents).toBe(0); // no full-logout side effects for an anonymous visit
      expect(callsTo("logout")).toBe(0);
      expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toBeNull();
    });

    test("refresh ok but the profile is refused (deactivated account) ends the session locally", async () => {
      setAccessToken("access-old");
      localStorage.setItem("user", JSON.stringify(ADA));
      seedRoutes({ profile: [respond(401)], refresh: [refreshOk("access-2")] });

      renderProvider();

      await waitFor(() => expect(text("loading")).toBe("false"));
      await flushReal();
      expect(text("user")).toBe("none");
      expect(getAccessToken()).toBeNull();
      expect(callsTo("logout")).toBe(0);
    });
  });

  describe("transient failures at restore (self-healing)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test.each([
      ["profile 503", respond(503)],
      ["profile 429", respond(429)],
      ["profile network error (Safari 'Load failed')", networkDown],
      ["profile 200 without a user (proxy / captive portal page)", respond(200, {})],
    ])(
      "%s: session untouched, loading released, no logout, and the retry restores it",
      async (_name, failure) => {
        setAccessToken("access-1");
        localStorage.setItem("user", JSON.stringify(ADA));
        localStorage.setItem("wishlist", "[1]");
        seedRoutes({ profile: [failure, profileOk()] });

        renderProvider();
        await advance(0);

        // FIRST attempt finished: UI is not blocked, nothing was destroyed.
        expect(text("loading")).toBe("false");
        expect(text("user")).toBe("none");
        expect(getAccessToken()).toBe("access-1");
        expect(localStorage.getItem("user")).toBe(JSON.stringify(ADA));
        expect(localStorage.getItem("wishlist")).toBe("[1]");
        expect(callsTo("logout")).toBe(0);
        expect(callsTo("refresh")).toBe(0);
        expect(userLogoutEvents).toBe(0);
        expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toBeNull();
        expect(mockReport).toHaveBeenCalledWith(
          expect.objectContaining({ op: "restore", stage: "restore_transient" })
        );

        // Bounded self-healing retry after 3 s.
        await advance(2_999);
        expect(text("user")).toBe("none");
        await advance(1);
        expect(text("user")).toBe(ADA.email);
        expect(text("token")).toBe("access-1");
        expect(callsTo("logout")).toBe(0);
      }
    );

    test("expired access + refresh TRANSIENT: nothing cleared, no logout, later retry restores", async () => {
      setAccessToken("access-old");
      localStorage.setItem("user", JSON.stringify(ADA));
      localStorage.setItem("wishlist", "[1]");
      seedRoutes({
        profile: [profileValidFor("access-2")],
        refresh: [respond(503), refreshOk("access-2")],
      });

      renderProvider();
      await advance(0);

      expect(text("loading")).toBe("false");
      expect(text("user")).toBe("none");
      expect(getAccessToken()).toBe("access-old"); // NOT wiped by a 503
      expect(localStorage.getItem("user")).toBe(JSON.stringify(ADA));
      expect(localStorage.getItem("wishlist")).toBe("[1]");
      expect(callsTo("logout")).toBe(0);
      expect(userLogoutEvents).toBe(0);

      await advance(3_000);
      expect(text("user")).toBe(ADA.email);
      expect(getAccessToken()).toBe("access-2");
      expect(callsTo("logout")).toBe(0);
    });

    test("cookie probe with a network error keeps the cached profile and retries", async () => {
      localStorage.setItem("user", JSON.stringify(ADA));
      seedRoutes({
        profile: [profileValidFor("access-2")],
        refresh: [networkDown, refreshOk("access-2")],
      });

      renderProvider();
      await advance(0);

      expect(text("loading")).toBe("false");
      expect(text("user")).toBe("none");
      expect(localStorage.getItem("user")).toBe(JSON.stringify(ADA));
      expect(callsTo("logout")).toBe(0);

      await advance(3_000);
      expect(text("user")).toBe(ADA.email);
    });

    test("retries are bounded (3 timed retries) and the browser 'online' event heals afterwards", async () => {
      setAccessToken("access-1");
      seedRoutes({ profile: [respond(503)] });

      renderProvider();
      await advance(0);
      expect(callsTo("profile")).toBe(1);

      await advance(3_000); // +3 s
      await advance(10_000); // +10 s
      await advance(30_000); // +30 s
      expect(callsTo("profile")).toBe(4); // first attempt + 3 retries

      await advance(10 * 60_000); // no more timed retries
      expect(callsTo("profile")).toBe(4);
      expect(text("user")).toBe("none");
      expect(getAccessToken()).toBe("access-1");

      // Network is back: retry immediately, and heal.
      routes.profile = [profileOk()];
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await advance(0);
      expect(text("user")).toBe(ADA.email);
      expect(callsTo("profile")).toBe(5);

      // Healed: the listeners are gone, another 'online' does nothing.
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await advance(0);
      expect(callsTo("profile")).toBe(5);
    });

    test("'online' retries are capped too (no hammering on a flapping connection)", async () => {
      setAccessToken("access-1");
      seedRoutes({ profile: [respond(503)] });
      renderProvider();
      await advance(0);
      await advance(43_000); // exhaust timed retries
      const afterTimers = callsTo("profile");

      for (let i = 0; i < 12; i += 1) {
        act(() => {
          window.dispatchEvent(new Event("online"));
        });
        await advance(0);
      }

      expect(callsTo("profile") - afterTimers).toBe(5);
    });

    test("showing the tab again retries a pending restore", async () => {
      setAccessToken("access-1");
      seedRoutes({ profile: [respond(503), profileOk()] });
      renderProvider();
      await advance(0);
      expect(text("user")).toBe("none");

      setTabVisible();
      await advance(0);

      expect(text("user")).toBe(ADA.email);
    });

    test("unmounting cancels pending retries and listeners", async () => {
      setAccessToken("access-1");
      seedRoutes({ profile: [respond(503)] });
      const view = renderProvider();
      await advance(0);
      expect(callsTo("profile")).toBe(1);

      view.unmount();
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await advance(60_000);

      expect(callsTo("profile")).toBe(1);
    });

    test("the restoring spinner is released after 12 s even if the first attempt is still running", async () => {
      setAccessToken("access-old");
      const slowUnauthorized: Responder = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        return mockRes(401);
      };
      // profile answers 401 after 5 s, then the CSRF endpoint hangs (10 s timeout)
      seedRoutes({ profile: [slowUnauthorized], csrf: [hang] });

      renderProvider();
      await advance(11_999);
      expect(text("loading")).toBe("true");

      await advance(1);
      expect(text("loading")).toBe("false"); // released by the cap while restore continues
      expect(text("user")).toBe("none");

      await advance(10_000); // the CSRF request times out -> transient, nothing destroyed
      expect(getAccessToken()).toBe("access-old");
      expect(callsTo("logout")).toBe(0);
      expect(userLogoutEvents).toBe(0);
    });
  });

  describe("login/logout that happens while restore is in flight", () => {
    test("a login during the profile check wins over the stale restore result", async () => {
      setAccessToken("access-old");
      const slowProfile = deferredResponder();
      seedRoutes({ profile: [slowProfile.responder] });
      renderProvider();
      await flushReal();

      act(() => {
        auth.login({ access: "access-new" }, { ...BOB, name: "" });
      });
      expect(text("user")).toBe(BOB.email);

      await act(async () => {
        slowProfile.resolve(mockRes(401)); // stale verdict about the OLD token
      });
      await flushReal();

      expect(text("user")).toBe(BOB.email);
      expect(text("token")).toBe("access-new");
      expect(getAccessToken()).toBe("access-new");
      expect(callsTo("refresh")).toBe(0);
      expect(callsTo("logout")).toBe(0);
    });

    test("a login during the cookie probe is not wiped by the probe's rejection", async () => {
      const slowRefresh = deferredResponder();
      seedRoutes({ refresh: [slowRefresh.responder] });
      renderProvider();
      await flushReal();

      act(() => {
        auth.login({ access: "access-new" }, { ...BOB, name: "" });
      });
      await act(async () => {
        slowRefresh.resolve(mockRes(401, { detail: "no cookie for the old session" }));
      });
      await flushReal();

      expect(text("user")).toBe(BOB.email);
      expect(text("token")).toBe("access-new");
      expect(getAccessToken()).toBe("access-new");
      expect(JSON.parse(localStorage.getItem("user") as string).email).toBe(BOB.email);
      expect(callsTo("logout")).toBe(0);
    });

    test("a logout during a transient-pending restore cancels the retries", async () => {
      jest.useFakeTimers();
      setAccessToken("access-1");
      seedRoutes({ profile: [respond(503)] });
      renderProvider();
      await advance(0);

      await act(async () => {
        await auth.logout();
      });
      const profileCalls = callsTo("profile");
      await advance(60_000);

      expect(callsTo("profile")).toBe(profileCalls);
      expect(text("user")).toBe("none");
    });
  });

  describe("tab visibility", () => {
    test("transient validation failure does nothing (no refresh, no logout, session kept)", async () => {
      await signIn();
      routes.profile = [respond(503)];

      setTabVisible();
      await flushReal();

      expect(callsTo("profile")).toBe(1);
      expect(callsTo("refresh")).toBe(0);
      expect(callsTo("logout")).toBe(0);
      expect(text("user")).toBe(ADA.email);
      expect(getAccessToken()).toBe("access-1");
      expect(userLogoutEvents).toBe(0);
    });

    test("network error on focus (phone waking up offline) does nothing", async () => {
      await signIn();
      routes.profile = [networkDown];

      setTabVisible();
      await flushReal();

      expect(callsTo("refresh")).toBe(0);
      expect(callsTo("logout")).toBe(0);
      expect(text("user")).toBe(ADA.email);
      expect(getAccessToken()).toBe("access-1");
    });

    test("healthy token just refreshes the cached profile", async () => {
      await signIn();
      routes.profile = [profileOk({ ...ADA, first_name: "Augusta" })];

      setTabVisible();
      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem("user") as string).first_name).toBe("Augusta")
      );
      expect(callsTo("refresh")).toBe(0);
    });

    test("unauthorized token is refreshed and the session continues", async () => {
      await signIn();
      routes.profile = [profileValidFor("access-2", { ...ADA, first_name: "Augusta" })];
      routes.refresh = [refreshOk("access-2")];

      setTabVisible();

      await waitFor(() => expect(text("token")).toBe("access-2"));
      expect(text("user")).toBe(ADA.email);
      expect(callsTo("logout")).toBe(0);
    });

    test("unauthorized + refresh REJECTED ends the session locally (no server logout)", async () => {
      await signIn();
      routes.profile = [respond(401)];
      routes.refresh = [respond(401)];

      setTabVisible();

      await waitFor(() => expect(text("user")).toBe("none"));
      expect(getAccessToken()).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
      expect(callsTo("logout")).toBe(0);
      expect(userLogoutEvents).toBeGreaterThanOrEqual(1);
      expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toBeTruthy();
    });

    test("unauthorized + refresh TRANSIENT keeps everything", async () => {
      await signIn();
      routes.profile = [respond(401)];
      routes.refresh = [respond(503)];

      setTabVisible();
      await waitFor(() => expect(callsTo("refresh")).toBe(1));
      await flushReal();

      expect(text("user")).toBe(ADA.email);
      expect(getAccessToken()).toBe("access-1");
      expect(localStorage.getItem("user")).not.toBeNull();
      expect(callsTo("logout")).toBe(0);
      expect(userLogoutEvents).toBe(0);
      expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toBeNull();
    });

    test("persisted user marker gone while this tab still has a session: local cleanup, no server logout", async () => {
      await signIn();
      localStorage.removeItem("user");

      setTabVisible();
      await flushReal();

      expect(text("user")).toBe("none");
      expect(getAccessToken()).toBeNull();
      expect(callsTo("profile")).toBe(0);
      expect(callsTo("refresh")).toBe(0);
      expect(callsTo("logout")).toBe(0);
      expect(userLogoutEvents).toBeGreaterThanOrEqual(1);
    });
  });

  describe("auth:logout event (dispatched by httpClient after a REJECTED refresh)", () => {
    test("is a LOCAL cleanup: state, tokens and caches cleared, no server logout request", async () => {
      await signIn();
      localStorage.setItem("wishlist", "[1]");
      localStorage.setItem("cart", "[]");

      act(() => {
        window.dispatchEvent(new CustomEvent("auth:logout"));
      });
      await flushReal();

      expect(text("user")).toBe("none");
      expect(text("token")).toBe("none");
      expect(getAccessToken()).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
      expect(localStorage.getItem("wishlist")).toBeNull();
      expect(localStorage.getItem("cart")).toBeNull();
      expect(userLogoutEvents).toBe(1); // cart/wishlist listeners are notified as before
      expect(callsTo("logout")).toBe(0);
      expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toBeTruthy();
    });
  });

  describe("cross-tab logout broadcast", () => {
    test("a storage event from another tab is LOCAL cleanup only (no second /logout/ POST)", async () => {
      await signIn();

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: AUTH_LOGOUT_AT_KEY,
            newValue: "other-tab:stamp",
            storageArea: localStorage,
          })
        );
      });
      await flushReal();

      expect(text("user")).toBe("none");
      expect(text("token")).toBe("none");
      expect(getAccessToken()).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
      expect(callsTo("logout")).toBe(0);
      expect(userLogoutEvents).toBeGreaterThanOrEqual(1);
    });

    test("ignores the storage event that this tab wrote", async () => {
      await signIn();
      await act(async () => {
        await auth.logout();
      });
      expect(callsTo("logout")).toBe(1);
      const ownStamp = localStorage.getItem(AUTH_LOGOUT_AT_KEY);
      expect(ownStamp).toBeTruthy();
      mockFetch.mockClear();

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: AUTH_LOGOUT_AT_KEY,
            newValue: ownStamp,
            storageArea: localStorage,
          })
        );
      });
      await flushReal();

      expect(callsTo("logout")).toBe(0);
    });

    test("login does not broadcast logout", async () => {
      seedRoutes({ refresh: [respond(401)] });
      renderProvider();
      await waitFor(() => expect(text("loading")).toBe("false"));
      await flushReal();

      act(() => {
        auth.login({ access: "access-new" }, { ...BOB, name: "" });
      });

      expect(text("user")).toBe(BOB.email);
      expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toBeNull();
    });
  });

  describe("explicit logout()", () => {
    test("posts the server logout ONCE (with a timeout) and clears everything locally", async () => {
      await signIn();
      localStorage.setItem("auth_wishlist_v1_1", "[1]");
      localStorage.setItem("cart_snapshot_v1_1", "[]");

      await act(async () => {
        await auth.logout();
      });

      expect(callsTo("logout")).toBe(1);
      const [url, init] = mockFetch.mock.calls.find(([u]) => routeOf(String(u)) === "logout") as [
        string,
        RequestInit,
      ];
      expect(url).toBe("/api/auth/logout/");
      expect(init.method).toBe("POST");
      expect(init.signal).toBeDefined(); // bounded by the 10 s timeout
      expect((init.headers as Headers).get("Authorization")).toBe("Bearer access-1");
      expect(text("user")).toBe("none");
      expect(text("token")).toBe("none");
      expect(getAccessToken()).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
      expect(localStorage.getItem("auth_wishlist_v1_1")).toBeNull();
      expect(localStorage.getItem("cart_snapshot_v1_1")).toBeNull();
      expect(userLogoutEvents).toBe(1);
      expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toBeTruthy();
    });

    test.each([
      ["server error", respond(500, { error: "boom" })],
      ["network failure", networkDown],
    ])("always clears locally even when the server call fails (%s)", async (_name, failure) => {
      await signIn();
      routes.logout = [failure];

      await act(async () => {
        await auth.logout();
      });

      expect(callsTo("logout")).toBe(1);
      expect(text("user")).toBe("none");
      expect(getAccessToken()).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
      expect(userLogoutEvents).toBe(1);
    });

    test("a hanging logout request times out after 10 s and still clears locally", async () => {
      jest.useFakeTimers();
      await act(async () => {
        setAccessToken("access-1");
        seedRoutes({ profile: [profileOk()], logout: [hang] });
        renderProvider();
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(text("user")).toBe(ADA.email);

      let finished = false;
      await act(async () => {
        void Promise.resolve(auth.logout()).then(() => {
          finished = true;
        });
        await jest.advanceTimersByTimeAsync(9_999);
      });
      expect(finished).toBe(false);
      expect(text("user")).toBe(ADA.email); // still waiting on the server

      await advance(1);

      expect(finished).toBe(true);
      expect(text("user")).toBe("none");
      expect(getAccessToken()).toBeNull();
    });

    test("without a session it still asks the server to clear the cookie (no refresh attempt)", async () => {
      seedRoutes({ refresh: [respond(401)] });
      renderProvider();
      await waitFor(() => expect(text("loading")).toBe("false"));
      await flushReal();
      mockFetch.mockClear();

      await act(async () => {
        await auth.logout();
      });

      expect(callsTo("logout")).toBe(1);
      expect(callsTo("refresh")).toBe(0);
      const [, init] = mockFetch.mock.calls.find(([u]) => routeOf(String(u)) === "logout") as [
        string,
        RequestInit,
      ];
      expect((init.headers as Headers).has("Authorization")).toBe(false);
    });
  });

  describe("refreshToken() keeps its boolean contract", () => {
    const callRefreshToken = async () => {
      let result: boolean | undefined;
      await act(async () => {
        result = await auth.refreshToken();
      });
      return result;
    };

    test("true only when a new access token was obtained", async () => {
      await signIn();

      routes.refresh = [respond(503)];
      expect(await callRefreshToken()).toBe(false);
      expect(getAccessToken()).toBe("access-1"); // transient: untouched

      routes.refresh = [refreshOk("access-3")];
      routes.profile = [profileValidFor("access-3")];
      expect(await callRefreshToken()).toBe(true);
      expect(getAccessToken()).toBe("access-3");

      routes.refresh = [respond(401)];
      expect(await callRefreshToken()).toBe(false);
    });
  });
});
