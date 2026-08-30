/** Default timeout for auth restore / token / profile requests. */
export const AUTH_FETCH_TIMEOUT_MS = 10_000;

/** Default timeout for storefront category metadata. */
export const CATEGORY_FETCH_TIMEOUT_MS = 15_000;

export class FetchTimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "FetchTimeoutError";
  }
}

/**
 * `fetch` with an upper bound on wait time. Throws {@link FetchTimeoutError} when
 * the timeout fires (distinct from caller-initiated abort).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = AUTH_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const { signal: userSignal, ...rest } = init;

  const onUserAbort = () => controller.abort();
  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort();
    } else {
      userSignal.addEventListener("abort", onUserAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (userSignal?.aborted) {
        throw err;
      }
      throw new FetchTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (userSignal) {
      userSignal.removeEventListener("abort", onUserAbort);
    }
  }
}
