/**
 * Cross-tab single-flight for the refresh-token exchange (Web Locks API).
 *
 * The refresh cookie is ROTATED on every refresh (and the old one blacklisted), so two tabs
 * refreshing at the same time race each other: the loser presents an already-rotated cookie.
 * Holding an exclusive origin-wide lock across the network round-trip serialises the tabs and
 * guarantees the browser has applied the rotated `Set-Cookie` before the next tab refreshes.
 *
 * Falls back to running WITHOUT the lock (never blocks auth) when `navigator.locks` is missing
 * (older Safari, jsdom), when the lock request fails before being granted, or when waiting for
 * it takes longer than `timeoutMs`.
 */

export const REFRESH_LOCK_NAME = "landars-auth-refresh";
export const REFRESH_LOCK_WAIT_MS = 15_000;

export interface RefreshLockOptions {
  /** Max time to WAIT for the lock (not to hold it) before running `fn` unlocked. */
  timeoutMs?: number;
}

interface LockManagerLike {
  request<R>(
    name: string,
    options: { mode?: "exclusive" | "shared"; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<R> | R
  ): Promise<R>;
}

function getLockManager(): LockManagerLike | null {
  try {
    if (typeof navigator === "undefined") return null;
    const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
    return locks && typeof locks.request === "function" ? locks : null;
  } catch {
    return null;
  }
}

export async function withRefreshLock<T>(
  fn: () => Promise<T>,
  opts: RefreshLockOptions = {}
): Promise<T> {
  const locks = getLockManager();
  if (!locks) return fn();

  const timeoutMs = opts.timeoutMs ?? REFRESH_LOCK_WAIT_MS;
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  let acquired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    if (controller) {
      timer = setTimeout(() => {
        if (!acquired) controller.abort();
      }, timeoutMs);
    }

    return await locks.request(
      REFRESH_LOCK_NAME,
      {
        mode: "exclusive",
        ...(controller ? { signal: controller.signal } : {}),
      },
      async () => {
        acquired = true;
        if (timer) clearTimeout(timer);
        return fn();
      }
    );
  } catch (error) {
    // `fn` ran under the lock and failed: that is the caller's error, not a lock problem.
    if (acquired) throw error;
    // The lock was never granted (wait timed out / unsupported context): run unlocked.
    return fn();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
