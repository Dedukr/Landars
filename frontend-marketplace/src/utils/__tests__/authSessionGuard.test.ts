import {
  authTokensUnchanged,
  createAuthGeneration,
  hasReplacementSession,
  hasSolidAuthSession,
} from "../authSessionGuard";

describe("createAuthGeneration", () => {
  it("marks snapshots stale after bump (login/logout during restore)", () => {
    const gen = createAuthGeneration();
    const restoreSnapshot = gen.snapshot();

    expect(gen.isCurrent(restoreSnapshot)).toBe(true);

    gen.bump(); // login completed while restore was in flight

    expect(gen.isCurrent(restoreSnapshot)).toBe(false);
    expect(gen.isCurrent(gen.snapshot())).toBe(true);
  });

  it("keeps independent snapshots isolated", () => {
    const gen = createAuthGeneration();
    const first = gen.snapshot();
    gen.bump();
    const second = gen.snapshot();
    gen.bump();

    expect(gen.isCurrent(first)).toBe(false);
    expect(gen.isCurrent(second)).toBe(false);
  });
});

describe("authTokensUnchanged / hasReplacementSession", () => {
  let currentAccess: string | null = null;
  const getAccess = () => currentAccess;

  beforeEach(() => {
    currentAccess = null;
  });

  it("returns true when access matches the restore snapshot", () => {
    currentAccess = "access-a";

    expect(authTokensUnchanged("access-a", getAccess)).toBe(true);
    expect(hasReplacementSession("access-a", getAccess)).toBe(false);
  });

  it("detects login that replaced access during restore", () => {
    currentAccess = "access-new";

    expect(authTokensUnchanged("access-old", getAccess)).toBe(false);
    expect(hasReplacementSession("access-old", getAccess)).toBe(true);
  });

  it("does not treat cleared access after failed refresh as a replacement", () => {
    currentAccess = null;
    expect(authTokensUnchanged("access-old", getAccess)).toBe(false);
    expect(hasReplacementSession("access-old", getAccess)).toBe(false);
  });
});

describe("hasSolidAuthSession", () => {
  it("requires both access and user profile", () => {
    expect(hasSolidAuthSession("access", { id: 1 })).toBe(true);
    expect(hasSolidAuthSession(null, { id: 1 })).toBe(false);
    expect(hasSolidAuthSession("access", null)).toBe(false);
    expect(hasSolidAuthSession(undefined, undefined)).toBe(false);
  });
});
