import "@testing-library/jest-dom";
import { fetchCSRFToken, resetCSRFToken } from "../csrf";
import { httpClient } from "../httpClient";

jest.mock("../authTelemetry", () => ({ reportAuthClientEvent: jest.fn() }));

const mockFetch = jest.fn();

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: "",
  headers: { get: () => null },
  json: async () => body,
});

describe("csrf.ts", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    resetCSRFToken();
  });

  test("fetchCSRFToken caches the token until it is reset", async () => {
    mockFetch.mockResolvedValue(ok({ csrfToken: "tok-1" }));

    await expect(fetchCSRFToken()).resolves.toBe("tok-1");
    await expect(fetchCSRFToken()).resolves.toBe("tok-1");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resetCSRFToken();
    mockFetch.mockResolvedValue(ok({ csrfToken: "tok-2" }));
    await expect(fetchCSRFToken()).resolves.toBe("tok-2");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("resetCSRFToken also clears the token cached by httpClient (one consistent reset)", async () => {
    mockFetch.mockResolvedValueOnce(ok({ csrfToken: "http-tok-1" }));
    mockFetch.mockResolvedValueOnce(ok({ done: true }));
    await httpClient.get("/api/test"); // httpClient caches "http-tok-1"
    expect(mockFetch).toHaveBeenCalledTimes(2);

    resetCSRFToken(); // the csrf.ts reset

    mockFetch.mockResolvedValueOnce(ok({ csrfToken: "http-tok-2" }));
    mockFetch.mockResolvedValueOnce(ok({ done: true }));
    await httpClient.get("/api/test");

    expect(mockFetch).toHaveBeenCalledTimes(4); // token was fetched again, not reused
    expect(mockFetch.mock.calls[3][1].headers.get("X-CSRFToken")).toBe("http-tok-2");
  });
});
