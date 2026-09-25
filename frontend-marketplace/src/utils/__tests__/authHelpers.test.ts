import {
  AUTH_LOGIN_NETWORK_ERROR_MESSAGE,
  AUTH_NETWORK_ERROR_MESSAGE,
  describeAuthError,
  formatCountdown,
  formatWaitTime,
  getAuthErrorPayload,
  getAuthUrl,
  getSafeNextRedirect,
  isAuthNetworkError,
  isTransientAuthError,
  describeResendQueuedNotice,
  type AuthErrorContext,
} from "../authHelpers";

/** Error shaped like the ones `httpClient` throws for a non-2xx response. */
function httpError(
  status: number,
  data: unknown = {},
  response: Record<string, unknown> = {}
): Error {
  const error = new Error(`HTTP ${status}: something`) as Error & {
    response: unknown;
  };
  error.response = { data, status, ...response };
  return error;
}

describe("getSafeNextRedirect", () => {
  it("allows normal relative paths", () => {
    expect(getSafeNextRedirect("/shop")).toBe("/shop");
    expect(getSafeNextRedirect("/orders/12")).toBe("/orders/12");
    expect(getSafeNextRedirect("%2Fcart%2F")).toBe("/cart/");
  });

  it("rejects auth and recovery loops", () => {
    expect(getSafeNextRedirect("/auth")).toBeNull();
    expect(getSafeNextRedirect("/auth/")).toBeNull();
    expect(getSafeNextRedirect("/auth/?mode=signin")).toBeNull();
    expect(getSafeNextRedirect("%2Fauth%2F")).toBeNull();
    expect(getSafeNextRedirect("/verify-email?token=x")).toBeNull();
    expect(getSafeNextRedirect("/reset-password")).toBeNull();
  });

  it("rejects external or protocol-relative URLs", () => {
    expect(getSafeNextRedirect("https://evil.com")).toBeNull();
    expect(getSafeNextRedirect("//evil.com")).toBeNull();
    expect(getSafeNextRedirect("")).toBeNull();
    expect(getSafeNextRedirect(null)).toBeNull();
  });

  // Browsers treat "\" like "/" and drop tab/CR/LF while parsing URLs, so these
  // all navigate to https://evil.com/ if they reach router.replace() unchanged.
  it.each([
    ["backslash", "/\\evil.com"],
    ["encoded backslash", "/%5Cevil.com"],
    ["tab", "/\t/evil.com"],
    ["encoded tab", "/%09/evil.com"],
    ["newline", "/\n/evil.com"],
    ["encoded newline", "/%0a/evil.com"],
    ["carriage return", "/\r/evil.com"],
    ["NUL", "/%00/evil.com"],
    ["backslash after a path", "/shop\\..\\evil.com"],
  ])("rejects an open-redirect payload: %s", (_label, payload) => {
    expect(getSafeNextRedirect(payload)).toBeNull();
    expect(getAuthUrl({ mode: "signin", next: payload })).toBe(
      "/auth?mode=signin"
    );
  });

  it("still allows paths with query strings, hashes and encoded characters", () => {
    expect(getSafeNextRedirect("/product/12?ref=a%20b#reviews")).toBe(
      "/product/12?ref=a b#reviews"
    );
    expect(getSafeNextRedirect("/orders/5?tab=items&x=1")).toBe(
      "/orders/5?tab=items&x=1"
    );
  });
});

describe("getAuthUrl", () => {
  it("omits unsafe next values", () => {
    expect(getAuthUrl({ mode: "signin", next: "/auth/" })).toBe(
      "/auth?mode=signin"
    );
    expect(getAuthUrl({ mode: "signin", next: "/cart" })).toBe(
      "/auth?mode=signin&next=%2Fcart"
    );
  });
});

describe("isAuthNetworkError", () => {
  it("maps Safari Load failed and Failed to fetch", () => {
    expect(isAuthNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isAuthNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isAuthNetworkError(new Error("Request timed out"))).toBe(true);
    expect(isAuthNetworkError(new Error("Invalid password"))).toBe(false);
  });

  it("exposes user-facing messages", () => {
    expect(AUTH_NETWORK_ERROR_MESSAGE).toMatch(/account may have been created/i);
    expect(AUTH_LOGIN_NETWORK_ERROR_MESSAGE).toMatch(/connection/i);
  });
});

describe("isAuthNetworkError (refined)", () => {
  it("no longer treats an arbitrary TypeError as a network failure", () => {
    expect(
      isAuthNetworkError(
        new TypeError("Cannot read properties of undefined (reading 'user')")
      )
    ).toBe(false);
  });

  it("recognises the fetch failure texts of the major browsers", () => {
    expect(
      isAuthNetworkError(
        new TypeError("NetworkError when attempting to fetch resource.")
      )
    ).toBe(true);
    expect(
      isAuthNetworkError(
        new TypeError("The Internet connection appears to be offline.")
      )
    ).toBe(true);
    expect(isAuthNetworkError(new TypeError("fetch failed"))).toBe(true);
  });

  it("trusts the flags set by httpClient", () => {
    expect(
      isAuthNetworkError(
        Object.assign(new TypeError("boom"), { isNetworkError: true })
      )
    ).toBe(true);
    expect(
      isAuthNetworkError(Object.assign(new Error("x"), { isTimeout: true }))
    ).toBe(true);
  });

  it("recognises FetchTimeoutError by name (current httpClient)", () => {
    const timeout = new Error("whatever");
    timeout.name = "FetchTimeoutError";
    expect(isAuthNetworkError(timeout)).toBe(true);
  });

  it("never reports an error that carries an HTTP response", () => {
    expect(isAuthNetworkError(httpError(500, { error: "Network error" }))).toBe(
      false
    );
  });

  it("ignores non-errors", () => {
    expect(isAuthNetworkError("Load failed")).toBe(false);
    expect(isAuthNetworkError(null)).toBe(false);
    expect(isAuthNetworkError(undefined)).toBe(false);
  });
});

describe("describeAuthError", () => {
  const contexts: AuthErrorContext[] = [
    "login",
    "register",
    "verify",
    "resend",
    "reset",
  ];

  describe("no HTTP response", () => {
    it("maps isTimeout and FetchTimeoutError to timeout", () => {
      const flagged = Object.assign(new Error("x"), { isTimeout: true });
      const named = new Error("Request timed out");
      named.name = "FetchTimeoutError";
      for (const error of [flagged, named]) {
        const described = describeAuthError(error, "login");
        expect(described.code).toBe("timeout");
        expect(described.message).toMatch(/timed out/i);
        expect(described.status).toBeUndefined();
      }
    });

    it("tells register customers the account may exist and a retry is safe", () => {
      for (const error of [
        new TypeError("Load failed"),
        Object.assign(new Error("x"), { isNetworkError: true }),
      ]) {
        const described = describeAuthError(error, "register");
        expect(described.code).toBe("network");
        expect(described.message).toMatch(/account may have been created/i);
        expect(described.message).toMatch(/safe to submit the same details/i);
      }
      const timeout = describeAuthError(
        Object.assign(new Error("x"), { isTimeout: true }),
        "register"
      );
      expect(timeout.code).toBe("timeout");
      expect(timeout.message).toMatch(/account may have been created/i);
    });

    it("asks other contexts to check the connection", () => {
      for (const context of contexts.filter((c) => c !== "register")) {
        const described = describeAuthError(
          new TypeError("Failed to fetch"),
          context
        );
        expect(described.code).toBe("network");
        expect(described.message).toMatch(/connection/i);
        expect(described.message).not.toMatch(/account may have been created/i);
      }
      expect(describeAuthError(new TypeError("Load failed"), "login").message).toBe(
        AUTH_LOGIN_NETWORK_ERROR_MESSAGE
      );
      expect(
        describeAuthError(new TypeError("Load failed"), "register").message
      ).toBe(AUTH_NETWORK_ERROR_MESSAGE);
    });

    it("maps a non-JSON 2xx body (SyntaxError) to server_error", () => {
      const described = describeAuthError(
        new SyntaxError("Unexpected token '<'"),
        "login"
      );
      expect(described.code).toBe("server_error");
      expect(described.message).not.toMatch(/Unexpected token/);
    });

    it("gives an unknown failure a safe generic message", () => {
      for (const error of [new Error("kaboom internal"), null, undefined, "x"]) {
        const described = describeAuthError(error, "login");
        expect(described.code).toBe("unknown");
        expect(described.message).toBe("Something went wrong. Please try again.");
      }
      // a programming error (TypeError) is not a network problem
      expect(
        describeAuthError(new TypeError("x is not a function"), "login").code
      ).toBe("unknown");
    });
  });

  describe("rate limiting", () => {
    it("uses retry_after and shows seconds below two minutes", () => {
      const described = describeAuthError(
        httpError(429, { error: "x", code: "rate_limited", retry_after: 45 }),
        "login"
      );
      expect(described).toMatchObject({
        code: "rate_limited",
        status: 429,
        retryAfter: 45,
      });
      expect(described.message).toBe(
        "Too many attempts. Please wait 45 seconds and try again."
      );
    });

    it("switches to minutes from 120 seconds", () => {
      const at = (retry_after: number) =>
        describeAuthError(
          httpError(429, { code: "rate_limited", retry_after }),
          "login"
        ).message;
      expect(at(119)).toMatch(/119 seconds/);
      expect(at(120)).toMatch(/2 minutes/);
      expect(at(301)).toMatch(/6 minutes/);
      expect(at(3600)).toMatch(/60 minutes/);
      expect(at(7200)).toMatch(/2 hours/);
    });

    it("prefers the Retry-After header value over the body", () => {
      const described = describeAuthError(
        httpError(429, { code: "rate_limited", retry_after: 10 }, { retryAfter: 30 }),
        "login"
      );
      expect(described.retryAfter).toBe(30);
    });

    it("handles a bare 429 without code or duration", () => {
      const described = describeAuthError(httpError(429, {}), "register");
      expect(described.code).toBe("rate_limited");
      expect(described.retryAfter).toBeUndefined();
      expect(described.message).toMatch(/Too many attempts/);
    });

    it("never shows the raw DRF throttle text", () => {
      const described = describeAuthError(
        httpError(429, {
          detail: "Request was throttled. Expected available in 30 seconds.",
        }),
        "login"
      );
      expect(described.code).toBe("rate_limited");
      expect(described.message).not.toMatch(/throttled|Expected available/);
    });

    it("ignores nonsense durations", () => {
      for (const retry_after of [0, -5, "abc", null, NaN]) {
        expect(
          describeAuthError(httpError(429, { code: "rate_limited", retry_after }), "login")
            .retryAfter
        ).toBeUndefined();
      }
    });
  });

  describe("cooldown", () => {
    it("uses cooldown_remaining and says what to wait for", () => {
      const resend = describeAuthError(
        httpError(429, { code: "cooldown", cooldown_remaining: 42, cooldown_total: 60 }),
        "resend"
      );
      expect(resend).toMatchObject({ code: "cooldown", retryAfter: 42, status: 429 });
      expect(resend.message).toBe(
        "A verification email was sent a moment ago. Please wait 42 seconds before requesting another one."
      );
      const reset = describeAuthError(
        httpError(429, { code: "cooldown", cooldown_remaining: 1 }),
        "reset"
      );
      expect(reset.message).toBe(
        "A reset link was sent a moment ago. Please wait 1 second before requesting another one."
      );
    });

    it("recognises a cooldown from an older backend (no code)", () => {
      const described = describeAuthError(
        httpError(429, { error: "Please wait 30 seconds", cooldown_remaining: 30 }),
        "resend"
      );
      expect(described).toMatchObject({ code: "cooldown", retryAfter: 30 });
    });
  });

  describe("account outcomes (by code)", () => {
    it.each([
      [400, "email_exists", /already exists/i],
      [401, "account_not_found", /No account found/i],
      [401, "invalid_password", /Incorrect password/i],
      [403, "account_inactive", /inactive.*contact support/i],
      [403, "email_not_verified", /verify your email/i],
    ])("maps %s %s", (status, code, pattern) => {
      const described = describeAuthError(
        httpError(status, { error: "backend wording", code }),
        "login"
      );
      expect(described.code).toBe(code);
      expect(described.status).toBe(status);
      expect(described.message).toMatch(pattern);
      expect(described.message).not.toMatch(/backend wording/);
    });

    it("reads the create-account suggestion structurally (older backend)", () => {
      const described = describeAuthError(
        httpError(401, {
          error: "No account found ... Would you like to create an account?",
          suggestion: "create_account",
        }),
        "login"
      );
      expect(described.code).toBe("account_not_found");
    });

    it("lets the code win over the wording of the message", () => {
      expect(
        describeAuthError(
          httpError(401, { error: "Please create an account", code: "invalid_password" }),
          "login"
        ).code
      ).toBe("invalid_password");
      // a 400 that merely says "already exists" is only a validation error without a code
      expect(
        describeAuthError(httpError(400, { error: "User already exists" }), "register")
          .code
      ).toBe("validation_error");
    });
  });

  describe("validation and tokens", () => {
    it("shows the server's validation message", () => {
      const described = describeAuthError(
        httpError(400, {
          error: "Password is too common",
          code: "validation_error",
          field: "password",
        }),
        "register"
      );
      expect(described.code).toBe("validation_error");
      expect(described.message).toBe("Password is too common");
    });

    it("joins list errors and reads DRF field errors", () => {
      expect(
        describeAuthError(httpError(400, { error: ["Too short.", "Too common."] }), "register")
          .message
      ).toBe("Too short. Too common.");
      expect(
        describeAuthError(httpError(400, { new_password: ["Too short."], token: ["x"] }), "reset")
          .message
      ).toBe("Too short.");
    });

    it("falls back to a generic validation message", () => {
      const described = describeAuthError(
        httpError(400, { code: "validation_error" }),
        "login"
      );
      expect(described.message).toBe(
        "Please check the details you entered and try again."
      );
    });

    it("maps token codes per context", () => {
      const invalid = (context: AuthErrorContext) =>
        describeAuthError(httpError(400, { code: "token_invalid" }), context);
      const expired = (context: AuthErrorContext) =>
        describeAuthError(httpError(400, { code: "token_expired" }), context);
      expect(invalid("verify").code).toBe("token_invalid");
      expect(invalid("verify").message).toMatch(/invalid or has already been used/);
      expect(expired("verify").code).toBe("token_expired");
      expect(expired("verify").message).toMatch(/expired/);
      expect(invalid("reset").message).toMatch(/password reset link.*new one/i);
      expect(expired("reset").message).toMatch(/password reset link has expired/i);
    });
  });

  describe("server failures", () => {
    it.each([500, 502, 503, 504])(
      "maps an HTML/empty %s body to a friendly server_error",
      (status) => {
        const described = describeAuthError(httpError(status, {}), "login");
        expect(described.code).toBe("server_error");
        expect(described.status).toBe(status);
        expect(described.message).toBe(
          "Something went wrong on our side. Please try again in a moment."
        );
        expect(described.message).not.toMatch(/HTTP|Bad Gateway|Service Unavailable/);
      }
    );

    it("maps any 5xx to server_error even with a JSON error text", () => {
      const described = describeAuthError(
        httpError(500, { error: "An error occurred during registration" }),
        "register"
      );
      expect(described.code).toBe("server_error");
      expect(described.message).not.toMatch(/registration/);
    });

    it("treats a non-JSON 4xx body as a server-side problem", () => {
      expect(describeAuthError(httpError(403, {}), "login").code).toBe("server_error");
    });

    it("appends the support reference from the response, or from the body", () => {
      const fromHeader = describeAuthError(
        httpError(502, {}, { requestId: "abcdef0123456789" }),
        "login"
      );
      expect(fromHeader.requestId).toBe("abcdef0123456789");
      expect(fromHeader.message).toMatch(/Reference: abcdef0123456789$/);

      const fromBody = describeAuthError(
        httpError(500, { code: "server_error", request_id: "req-12345678" }),
        "login"
      );
      expect(fromBody.requestId).toBe("req-12345678");
      expect(fromBody.message).toMatch(/Reference: req-12345678$/);
    });

    it("ignores request ids that do not look like ids", () => {
      const described = describeAuthError(
        httpError(500, { request_id: "<script>alert(1)</script>" }, { requestId: "has space" }),
        "login"
      );
      expect(described.requestId).toBeUndefined();
      expect(described.message).not.toMatch(/Reference/);
    });

    it("does not clutter ordinary customer errors with a reference", () => {
      const described = describeAuthError(
        httpError(401, { code: "invalid_password", request_id: "abcdef0123456789" }),
        "login"
      );
      expect(described.message).not.toMatch(/Reference/);
      expect(described.requestId).toBe("abcdef0123456789");
    });
  });

  describe("unknown statuses", () => {
    it("uses a short server message when the code is unknown", () => {
      const described = describeAuthError(httpError(418, { detail: "I am a teapot" }), "login");
      expect(described.code).toBe("unknown");
      expect(described.message).toBe("I am a teapot");
    });

    it("ignores absurdly long server messages", () => {
      const described = describeAuthError(
        httpError(418, { detail: "x".repeat(2000) }),
        "login"
      );
      expect(described.message).toBe("Something went wrong. Please try again.");
    });
  });
});

describe("auth error helpers", () => {
  it("formats waits and countdowns", () => {
    expect(formatWaitTime(1)).toBe("1 second");
    expect(formatWaitTime(45)).toBe("45 seconds");
    expect(formatWaitTime(150)).toBe("3 minutes");
    expect(formatCountdown(9)).toBe("9s");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0s");
  });

  it("exposes the JSON payload only when the body is an object", () => {
    expect(getAuthErrorPayload(httpError(400, { a: 1 }))).toEqual({ a: 1 });
    expect(getAuthErrorPayload(httpError(400, "<html>"))).toBeNull();
    expect(getAuthErrorPayload(new Error("x"))).toBeNull();
    expect(getAuthErrorPayload(null)).toBeNull();
  });

  it("describes a resend as queued unless email_queued is explicitly false", () => {
    expect(describeResendQueuedNotice({ already_verified: true }, "a@b.co").message).toMatch(
      /already verified/i
    );
    expect(describeResendQueuedNotice({ email_queued: false }, "a@b.co")).toEqual({
      kind: "error",
      message: "We could not send the verification email. Please try again in a moment.",
    });
    expect(describeResendQueuedNotice({ email_queued: true }, "a@b.co").kind).toBe("success");
    expect(describeResendQueuedNotice({}, "a@b.co").message).toMatch(/We've sent a new link to a@b.co/i);
  });

  it("classifies which codes are worth retrying", () => {
    for (const code of ["network", "timeout", "server_error", "rate_limited", "cooldown"] as const) {
      expect(isTransientAuthError(code)).toBe(true);
    }
    for (const code of ["token_invalid", "email_exists", "unknown", "validation_error"] as const) {
      expect(isTransientAuthError(code)).toBe(false);
    }
  });
});
