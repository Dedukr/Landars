import {
  FetchTimeoutError,
  fetchWithTimeout,
} from "@/utils/fetchWithTimeout";

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves when fetch completes in time", async () => {
    const response = { ok: true } as Response;
    mockFetch.mockResolvedValue(response);

    const promise = fetchWithTimeout("/api/test", {}, 5000);
    await jest.runAllTimersAsync();
    await expect(promise).resolves.toBe(response);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("throws FetchTimeoutError when fetch exceeds timeout", async () => {
    mockFetch.mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })
    );

    const promise = fetchWithTimeout("/api/slow", {}, 1000);
    const expectation = expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);

    await jest.advanceTimersByTimeAsync(1000);
    await expectation;
  });

  it("rethrows caller abort without FetchTimeoutError", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })
    );

    const promise = fetchWithTimeout("/api/test", { signal: controller.signal }, 5000);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });
});
