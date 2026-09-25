import "@testing-library/jest-dom";

// Telemetry is best-effort (fetch/sendBeacon); keep it out of the simulated network.
jest.mock("../authTelemetry", () => ({ reportAuthClientEvent: jest.fn() }));

type HttpClientModule = typeof import("../httpClient");

/**
 * Two browser tabs = two isolated copies of httpClient (own in-tab single-flight state) that
 * share ONE cookie jar, ONE server and ONE navigator.locks - exactly what happens in a browser.
 *
 * The simulated server ROTATES the refresh cookie on every refresh and rejects an
 * already-rotated one (SimpleJWT ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION).
 */
const jar = { refresh: "C1" };
const server = { validRefresh: "C1", rotations: 0 };

function csrfResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "",
    headers: { get: () => null },
    json: async () => ({ csrfToken: "csrf" }),
  };
}

function refreshResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    json: async () => body,
  };
}

const mockFetch = jest.fn();

function createFakeLockManager() {
  let held = false;
  const waiting: Array<() => void> = [];
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else held = false;
  };
  return {
    request: (
      _name: string,
      _options: unknown,
      callback: () => Promise<unknown>
    ) =>
      new Promise((resolve, reject) => {
        const run = async () => {
          try {
            resolve(await callback());
          } catch (error) {
            reject(error);
          } finally {
            release();
          }
        };
        if (!held) {
          held = true;
          void run();
        } else {
          waiting.push(() => void run());
        }
      }),
  };
}

async function loadTab(): Promise<HttpClientModule> {
  let tab!: HttpClientModule;
  await jest.isolateModulesAsync(async () => {
    tab = await import("../httpClient");
  });
  return tab;
}

describe("two tabs refreshing at the same time (rotating refresh cookie)", () => {
  beforeEach(() => {
    jar.refresh = "C1";
    server.validRefresh = "C1";
    server.rotations = 0;
    sessionStorage.clear();
    localStorage.clear();
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string) => {
      if (url === "/api/auth/csrf-token/") return csrfResponse();
      if (url === "/api/auth/token/refresh/") {
        const cookieSent = jar.refresh; // the browser attaches the cookie when sending
        await new Promise((resolve) => setTimeout(resolve, 15)); // network latency
        if (cookieSent !== server.validRefresh) {
          return refreshResponse(401, { detail: "Token is blacklisted" });
        }
        server.rotations += 1;
        server.validRefresh = `C${server.rotations + 1}`;
        jar.refresh = server.validRefresh; // Set-Cookie applied when the response arrives
        return refreshResponse(200, { access: `access-${server.rotations}` });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    delete (navigator as unknown as { locks?: unknown }).locks;
  });

  test("with the Web Locks API the tabs are serialised and BOTH refreshes succeed", async () => {
    Object.defineProperty(navigator, "locks", {
      value: createFakeLockManager(),
      configurable: true,
      writable: true,
    });
    const [tabA, tabB] = [await loadTab(), await loadTab()];

    const outcomes = await Promise.all([
      tabA.refreshAuthTokensDetailed(),
      tabB.refreshAuthTokensDetailed(),
    ]);

    expect(outcomes).toEqual(["ok", "ok"]);
    expect(server.rotations).toBe(2); // second tab used the cookie rotated by the first
    expect(jar.refresh).toBe("C3");
  });

  test("control: without navigator.locks the same race gives the loser a rejected refresh", async () => {
    expect((navigator as unknown as { locks?: unknown }).locks).toBeUndefined();
    const [tabA, tabB] = [await loadTab(), await loadTab()];

    const outcomes = await Promise.all([
      tabA.refreshAuthTokensDetailed(),
      tabB.refreshAuthTokensDetailed(),
    ]);

    expect([...outcomes].sort()).toEqual(["ok", "rejected"]);
  });
});
