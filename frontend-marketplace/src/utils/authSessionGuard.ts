/**
 * Monotonic generation counter so async restore/refresh work can detect
 * that login/logout replaced the session mid-flight.
 */
import { getAccessToken } from "./authTokenStore";

export function createAuthGeneration() {
  let generation = 0;

  return {
    bump(): number {
      generation += 1;
      return generation;
    },
    snapshot(): number {
      return generation;
    },
    isCurrent(snapshot: number): boolean {
      return generation === snapshot;
    },
  };
}

type AccessReader = () => string | null;

/**
 * True when the access token still matches the value captured at the start
 * of an async restore/refresh check. Refresh is httpOnly (not in JS storage).
 */
export function authTokensUnchanged(
  accessAtStart: string | null,
  getAccess: AccessReader = getAccessToken
): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return getAccess() === accessAtStart;
}

/**
 * True when a newer login stored an access token that differs from the
 * snapshot. Cleared access after a failed refresh does not count.
 */
export function hasReplacementSession(
  accessAtStart: string | null,
  getAccess: AccessReader = getAccessToken
): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const access = getAccess();
  return Boolean(access && access !== accessAtStart);
}

/**
 * True when both access token and user profile are present.
 * Token-only or user-only half-states must not be treated as authenticated.
 */
export function hasSolidAuthSession(
  access: string | null | undefined,
  user: unknown
): boolean {
  return Boolean(access && user);
}
