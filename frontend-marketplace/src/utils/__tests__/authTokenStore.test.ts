import {
  AUTH_LOGOUT_AT_KEY,
  broadcastLocalSessionEnded,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  subscribeRemoteSessionEnded,
} from "../authTokenStore";

const AUTH_BROADCAST_CHANNEL = "foodplatform-auth";

describe("authTokenStore access token", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearAccessToken();
  });

  test("set/get persist in sessionStorage, never localStorage", () => {
    setAccessToken("access-1");
    expect(getAccessToken()).toBe("access-1");
    expect(sessionStorage.getItem("authToken")).toBe("access-1");
    expect(localStorage.getItem("authToken")).toBeNull();
  });
});

describe("cross-tab logout broadcast", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test("writes auth:logout-at in localStorage (storage-event fallback)", () => {
    broadcastLocalSessionEnded();
    expect(localStorage.getItem(AUTH_LOGOUT_AT_KEY)).toMatch(/^\d+:/);
  });

  test("does not invoke the subscriber in the writing tab (stamp / no self-echo)", () => {
    const received: string[] = [];
    const stop = subscribeRemoteSessionEnded(() => received.push("remote"));
    broadcastLocalSessionEnded();
    const ownStamp = localStorage.getItem(AUTH_LOGOUT_AT_KEY);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: AUTH_LOGOUT_AT_KEY,
        newValue: ownStamp,
        storageArea: localStorage,
      })
    );

    expect(received).toEqual([]);
    stop();
  });

  test("storage event from another tab notifies once", () => {
    const received: string[] = [];
    const stop = subscribeRemoteSessionEnded(() => received.push("remote"));

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: AUTH_LOGOUT_AT_KEY,
        newValue: "other-tab:stamp",
        storageArea: localStorage,
      })
    );

    expect(received).toEqual(["remote"]);
    stop();
  });

  test("ignores unrelated storage keys and login-style user writes", () => {
    const received: string[] = [];
    const stop = subscribeRemoteSessionEnded(() => received.push("remote"));

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "user",
        newValue: JSON.stringify({ id: 1 }),
        storageArea: localStorage,
      })
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: AUTH_LOGOUT_AT_KEY,
        newValue: null,
        storageArea: localStorage,
      })
    );

    expect(received).toEqual([]);
    stop();
  });

  test("BroadcastChannel message from another instance notifies", async () => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    const received: string[] = [];
    const stop = subscribeRemoteSessionEnded(() => received.push("remote"));
    const otherTab = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    otherTab.postMessage({ type: "logout", stamp: "peer-tab" });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toEqual(["remote"]);

    otherTab.close();
    stop();
  });
});
