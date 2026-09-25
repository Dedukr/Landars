import "@testing-library/jest-dom";
import { REFRESH_LOCK_NAME, withRefreshLock } from "../refreshLock";

/**
 * Minimal Web Locks fake shared by every simulated "tab": exclusive, FIFO per lock name and
 * abortable while waiting - the subset of `navigator.locks` that refreshLock relies on.
 */
function createFakeLockManager() {
  const held = new Set<string>();
  const queues = new Map<string, Array<() => void>>();

  const release = (name: string) => {
    const next = queues.get(name)?.shift();
    if (next) {
      next();
    } else {
      held.delete(name);
    }
  };

  const request = jest.fn(
    (
      name: string,
      options: { mode?: string; signal?: AbortSignal },
      callback: () => unknown
    ) =>
      new Promise((resolve, reject) => {
        const run = async () => {
          try {
            resolve(await callback());
          } catch (error) {
            reject(error);
          } finally {
            release(name);
          }
        };

        if (options.signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        if (!held.has(name)) {
          held.add(name);
          void run();
          return;
        }

        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        const entry = () => {
          options.signal?.removeEventListener("abort", onAbort);
          void run();
        };
        const onAbort = () => {
          const index = queue.indexOf(entry);
          if (index >= 0) queue.splice(index, 1);
          reject(new DOMException("Aborted", "AbortError"));
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });
        queue.push(entry);
      })
  );

  return { request };
}

function installLocks(locks: unknown) {
  Object.defineProperty(navigator, "locks", {
    value: locks,
    configurable: true,
    writable: true,
  });
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("withRefreshLock", () => {
  afterEach(() => {
    jest.useRealTimers();
    delete (navigator as unknown as { locks?: unknown }).locks;
  });

  test("runs fn directly when navigator.locks is not available (jsdom / older Safari)", async () => {
    expect((navigator as unknown as { locks?: unknown }).locks).toBeUndefined();
    const fn = jest.fn().mockResolvedValue("value");

    await expect(withRefreshLock(fn)).resolves.toBe("value");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("propagates fn errors when there is no lock support", async () => {
    await expect(
      withRefreshLock(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  test("requests the named exclusive lock and returns fn's value", async () => {
    const locks = createFakeLockManager();
    installLocks(locks);

    await expect(withRefreshLock(async () => 42)).resolves.toBe(42);

    expect(locks.request).toHaveBeenCalledTimes(1);
    expect(locks.request).toHaveBeenCalledWith(
      REFRESH_LOCK_NAME,
      expect.objectContaining({ mode: "exclusive", signal: expect.anything() }),
      expect.any(Function)
    );
    expect(REFRESH_LOCK_NAME).toBe("landars-auth-refresh");
  });

  test("serialises two tabs: the second refresh starts only after the first finished", async () => {
    installLocks(createFakeLockManager()); // both "tabs" share one lock manager
    const events: string[] = [];
    const firstGate = deferred();

    const tabA = withRefreshLock(async () => {
      events.push("A:start");
      await firstGate.promise; // network round-trip incl. rotated Set-Cookie
      events.push("A:end");
      return "A";
    });
    const tabB = withRefreshLock(async () => {
      events.push("B:start");
      events.push("B:end");
      return "B";
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events).toEqual(["A:start"]); // B is waiting, not racing A

    firstGate.resolve();

    await expect(Promise.all([tabA, tabB])).resolves.toEqual(["A", "B"]);
    expect(events).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  test("fn errors are the caller's: propagated once, lock released, fn NOT re-run unlocked", async () => {
    installLocks(createFakeLockManager());
    const failing = jest.fn().mockRejectedValue(new Error("refresh exploded"));

    await expect(withRefreshLock(failing)).rejects.toThrow("refresh exploded");
    expect(failing).toHaveBeenCalledTimes(1);

    // the lock was released: the next tab can proceed
    await expect(withRefreshLock(async () => "next")).resolves.toBe("next");
  });

  test("runs fn WITHOUT the lock when waiting exceeds timeoutMs", async () => {
    jest.useFakeTimers();
    installLocks(createFakeLockManager());
    const events: string[] = [];
    const holderGate = deferred();

    const holder = withRefreshLock(async () => {
      events.push("holder:start");
      await holderGate.promise;
      events.push("holder:end");
      return "holder";
    });
    const waiter = withRefreshLock(
      async () => {
        events.push("waiter:run");
        return "waiter";
      },
      { timeoutMs: 100 }
    );

    await jest.advanceTimersByTimeAsync(99);
    expect(events).toEqual(["holder:start"]);

    await jest.advanceTimersByTimeAsync(1);
    await expect(waiter).resolves.toBe("waiter");
    expect(events).toEqual(["holder:start", "waiter:run"]);

    holderGate.resolve();
    await expect(holder).resolves.toBe("holder");
    // the timed-out waiter is not run a second time when the holder finally releases
    expect(events).toEqual(["holder:start", "waiter:run", "holder:end"]);
  });

  test("defaults to a 15 s wait before falling back", async () => {
    jest.useFakeTimers();
    installLocks(createFakeLockManager());
    const holderGate = deferred();
    const holder = withRefreshLock(async () => holderGate.promise);
    const fn = jest.fn().mockResolvedValue("late");
    const waiter = withRefreshLock(fn);

    await jest.advanceTimersByTimeAsync(14_999);
    expect(fn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(waiter).resolves.toBe("late");
    expect(fn).toHaveBeenCalledTimes(1);

    holderGate.resolve();
    await holder;
  });

  test("the wait timeout does not abort a fn that already holds the lock", async () => {
    jest.useFakeTimers();
    installLocks(createFakeLockManager());
    const fn = jest.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve("done"), 500))
    );

    const result = withRefreshLock(fn, { timeoutMs: 100 });
    await jest.advanceTimersByTimeAsync(600);

    await expect(result).resolves.toBe("done");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("falls back to running unlocked when the lock request is rejected before being granted", async () => {
    installLocks({
      request: jest.fn().mockRejectedValue(new DOMException("denied", "SecurityError")),
    });
    const fn = jest.fn().mockResolvedValue("unlocked");

    await expect(withRefreshLock(fn)).resolves.toBe("unlocked");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("falls back to running unlocked when locks.request throws synchronously", async () => {
    installLocks({
      request: jest.fn(() => {
        throw new TypeError("not supported here");
      }),
    });
    const fn = jest.fn().mockResolvedValue("unlocked");

    await expect(withRefreshLock(fn)).resolves.toBe("unlocked");

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
