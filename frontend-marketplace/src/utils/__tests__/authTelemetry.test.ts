import "@testing-library/jest-dom";
import {
  _resetAuthTelemetryForTests,
  reportAuthClientEvent,
} from "../authTelemetry";

const EVENT_URL = "/api/auth/client-event/";

const mockFetch = jest.fn();
const originalFetch = global.fetch;

let now = 1_000_000;

function setSendBeacon(impl: unknown) {
  Object.defineProperty(navigator, "sendBeacon", {
    value: impl,
    configurable: true,
    writable: true,
  });
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function beaconPayload(callIndex = 0): Promise<Record<string, unknown>> {
  const beacon = (navigator as unknown as { sendBeacon: jest.Mock }).sendBeacon;
  return JSON.parse(await readBlob(beacon.mock.calls[callIndex][1]));
}

describe("reportAuthClientEvent", () => {
  beforeEach(() => {
    _resetAuthTelemetryForTests();
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    global.fetch = mockFetch as unknown as typeof fetch;
    setSendBeacon(jest.fn().mockReturnValue(true));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    delete (navigator as unknown as { sendBeacon?: unknown }).sendBeacon;
  });

  test("sends one sendBeacon with a JSON Blob and the whitelisted payload", async () => {
    reportAuthClientEvent({
      op: "refresh",
      stage: "refresh_transient",
      status: 503,
      error: new TypeError("Load failed"),
      requestId: "req-abc12345",
      path: "/api/auth/token/refresh/",
    });

    const beacon = (navigator as unknown as { sendBeacon: jest.Mock }).sendBeacon;
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(EVENT_URL);
    expect(beacon.mock.calls[0][1]).toBeInstanceOf(Blob);
    expect(beacon.mock.calls[0][1].type).toBe("application/json");
    expect(await beaconPayload()).toEqual({
      op: "refresh",
      stage: "refresh_transient",
      status: 503,
      error: "TypeError",
      online: true,
      request_id: "req-abc12345",
      path: "/api/auth/token/refresh/",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("status is null and optional fields are omitted when unknown", async () => {
    reportAuthClientEvent({ op: "restore", stage: "restore_transient" });

    expect(await beaconPayload()).toEqual({
      op: "restore",
      stage: "restore_transient",
      status: null,
      online: true,
    });
  });

  test.each([
    ["sendBeacon is unavailable", () => delete (navigator as unknown as { sendBeacon?: unknown }).sendBeacon],
    ["sendBeacon returns false (queue full)", () => setSendBeacon(jest.fn().mockReturnValue(false))],
    [
      "sendBeacon throws",
      () =>
        setSendBeacon(
          jest.fn(() => {
            throw new TypeError("blocked");
          })
        ),
    ],
  ])("falls back to fetch keepalive when %s", (_name, arrange) => {
    arrange();

    reportAuthClientEvent({ op: "login", stage: "network", error: new TypeError("x") });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(EVENT_URL);
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(JSON.parse(init.body)).toEqual(
      expect.objectContaining({ op: "login", stage: "network", error: "TypeError", status: null })
    );
  });

  test("never sends messages, tokens, e-mails or query strings", async () => {
    const leaky = new Error(
      "user ada@example.com token eyJhbGciOi.secret password hunter2"
    );
    leaky.name = "Bad Name <script>";

    reportAuthClientEvent({
      op: "login",
      stage: "http",
      status: 500,
      error: leaky,
      requestId: "req-abc12345",
      path: "https://landarsfood.com/api/auth/login/?email=ada@example.com&token=eyJhbGciOi",
    });

    const serialized = JSON.stringify(await beaconPayload());
    expect(serialized).not.toMatch(/ada@example\.com|eyJhbGciOi|hunter2|secret|token=|email=|landarsfood/);
    expect(await beaconPayload()).toEqual(
      expect.objectContaining({ error: "Bad Name script", path: "/api/auth/login/" })
    );
  });

  test("error name is capped at 40 characters and strings are accepted as names", async () => {
    reportAuthClientEvent({ op: "login", stage: "network", error: "A".repeat(100) });

    const payload = await beaconPayload();
    expect(payload.error).toBe("A".repeat(40));
  });

  // The server (backend/account/client_events.py) answers 400 - and the event is lost - for
  // any `error` that does not fully match [A-Za-z0-9_. -]{0,40}.
  const SERVER_ERROR_RE = /^[A-Za-z0-9_. -]{0,40}$/;

  test.each([
    ["TypeError", "TypeError"],
    ["FetchTimeoutError", "FetchTimeoutError"],
    ["AbortError", "AbortError"],
    ["TypeError: Failed to fetch", "TypeError Failed to fetch"],
    ["dollar$ign and (parens) [brackets]", "dollarign and parens brackets"],
    ["caf\u00e9 \u4e2d\u6587 \ud83d\ude00 ok", "caf ok"],
    ["under_score.dot-dash", "under_score.dot-dash"],
    ["  padded  ", "padded"],
  ])("error %p is sanitised to the server charset (%p)", async (input, expected) => {
    reportAuthClientEvent({ op: "login", stage: "network", error: input });

    const payload = await beaconPayload();
    expect(payload.error).toBe(expected);
    expect(String(payload.error)).toMatch(SERVER_ERROR_RE);
  });

  test("an Error whose NAME has forbidden characters is sanitised, never its message", async () => {
    const error = new Error("Failed to fetch: https://x.test/?token=abc");
    error.name = "Weird:Error$1";

    reportAuthClientEvent({ op: "login", stage: "network", error });

    const payload = await beaconPayload();
    expect(payload.error).toBe("WeirdError1");
    expect(JSON.stringify(payload)).not.toMatch(/token|https|Failed to fetch/);
  });

  test("the error field is omitted when nothing valid is left after sanitising", async () => {
    reportAuthClientEvent({ op: "login", stage: "network", error: "::: $$$ " });

    expect("error" in (await beaconPayload())).toBe(false);
  });

  test("only plain /api/auth/ paths are sent; anything else is dropped", async () => {
    reportAuthClientEvent({ op: "login", stage: "http", status: 500, path: "/api/products/12/" });
    reportAuthClientEvent({ op: "register", stage: "http", status: 500, path: "/api/auth/Tokens/ABCdef123/" });
    reportAuthClientEvent({ op: "verify", stage: "http", status: 500, path: "/api/auth/verify-email/#frag" });

    expect((await beaconPayload(0)).path).toBeUndefined();
    expect((await beaconPayload(1)).path).toBeUndefined();
    expect((await beaconPayload(2)).path).toBe("/api/auth/verify-email/");
  });

  test("request ids follow the server rule [A-Za-z0-9._-]{8,64}; anything else is dropped", async () => {
    reportAuthClientEvent({ op: "login", stage: "http", status: 500, requestId: "bad id with spaces" });
    reportAuthClientEvent({ op: "login", stage: "http", status: 502, requestId: "x".repeat(65) });
    reportAuthClientEvent({ op: "login", stage: "http", status: 503, requestId: "abcdefg" }); // 7 chars
    reportAuthClientEvent({ op: "login", stage: "http", status: 504, requestId: "abcdefgh" }); // 8 chars
    reportAuthClientEvent({ op: "login", stage: "http", status: 505, requestId: "0123456789abcdef0123456789abcdef" });

    expect((await beaconPayload(0)).request_id).toBeUndefined();
    expect((await beaconPayload(1)).request_id).toBeUndefined();
    expect((await beaconPayload(2)).request_id).toBeUndefined();
    expect((await beaconPayload(3)).request_id).toBe("abcdefgh");
    expect((await beaconPayload(4)).request_id).toBe("0123456789abcdef0123456789abcdef");
  });

  test("paths longer than the server limit (80 chars) are dropped", async () => {
    const eighty = `/api/auth/${"a".repeat(70)}`;
    reportAuthClientEvent({ op: "login", stage: "http", status: 500, path: eighty });
    reportAuthClientEvent({ op: "login", stage: "http", status: 501, path: `${eighty}a` });

    expect((await beaconPayload(0)).path).toBe(eighty);
    expect((await beaconPayload(1)).path).toBeUndefined();
  });

  test.each([[NaN], [99], [600], [200.5], [undefined]])(
    "status %p is sent as null",
    async (status) => {
      reportAuthClientEvent({ op: "login", stage: "http", status: status as number | undefined });

      expect((await beaconPayload()).status).toBeNull();
    }
  );

  test("dedupes per (op, stage, status) for 30 s", () => {
    const beacon = (navigator as unknown as { sendBeacon: jest.Mock }).sendBeacon;
    const event = { op: "login", stage: "http", status: 503 } as const;

    reportAuthClientEvent(event);
    reportAuthClientEvent(event); // same key within the window -> dropped
    expect(beacon).toHaveBeenCalledTimes(1);

    reportAuthClientEvent({ ...event, status: 502 }); // different status
    reportAuthClientEvent({ ...event, stage: "network" }); // different stage
    reportAuthClientEvent({ ...event, op: "register" }); // different op
    expect(beacon).toHaveBeenCalledTimes(4);

    now += 29_999;
    reportAuthClientEvent(event);
    expect(beacon).toHaveBeenCalledTimes(4);

    now += 1; // 30 s elapsed
    reportAuthClientEvent(event);
    expect(beacon).toHaveBeenCalledTimes(5);
  });

  test("sends at most 20 events per page life", () => {
    const beacon = (navigator as unknown as { sendBeacon: jest.Mock }).sendBeacon;

    for (let i = 0; i < 30; i += 1) {
      now += 60_000; // far outside the dedupe window: only the page cap applies
      reportAuthClientEvent({ op: "login", stage: "http", status: 500 + (i % 90) });
    }

    expect(beacon).toHaveBeenCalledTimes(20);
  });

  test("never reports failures of the client-event endpoint itself", () => {
    const beacon = (navigator as unknown as { sendBeacon: jest.Mock }).sendBeacon;

    reportAuthClientEvent({ op: "login", stage: "network", path: "/api/auth/client-event/" });
    reportAuthClientEvent({ op: "login", stage: "http", status: 500, path: "https://x.test/api/auth/client-event/?a=1" });
    reportAuthClientEvent({ op: "login", stage: "timeout", path: "/api/auth/client-event" });

    expect(beacon).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("ignores events with an unknown op or stage", () => {
    const beacon = (navigator as unknown as { sendBeacon: jest.Mock }).sendBeacon;

    reportAuthClientEvent({ op: "checkout", stage: "network" } as never);
    reportAuthClientEvent({ op: "login", stage: "exploded" } as never);
    reportAuthClientEvent(null as never);
    reportAuthClientEvent(undefined as never);

    expect(beacon).not.toHaveBeenCalled();
  });

  test("never throws, whatever the transport does", () => {
    setSendBeacon(
      jest.fn(() => {
        throw new Error("beacon exploded");
      })
    );
    mockFetch.mockImplementation(() => {
      throw new Error("fetch exploded synchronously");
    });
    expect(() =>
      reportAuthClientEvent({ op: "login", stage: "network", error: new Error("x") })
    ).not.toThrow();

    mockFetch.mockReset();
    mockFetch.mockReturnValue(undefined); // not even a promise
    expect(() => reportAuthClientEvent({ op: "login", stage: "http", status: 500 })).not.toThrow();

    mockFetch.mockReset();
    mockFetch.mockRejectedValue(new TypeError("offline")); // async rejection is swallowed
    expect(() => reportAuthClientEvent({ op: "login", stage: "http", status: 501 })).not.toThrow();

    const poisoned = {
      op: "login",
      stage: "network",
      get error(): unknown {
        throw new Error("getter exploded");
      },
    };
    expect(() => reportAuthClientEvent(poisoned as never)).not.toThrow();
  });
});
