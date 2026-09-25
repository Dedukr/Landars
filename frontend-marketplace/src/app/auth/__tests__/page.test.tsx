import "@testing-library/jest-dom";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Auth from "../page";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockLogin = jest.fn();
// stable router identity, like the real Next.js router
const mockRouter = { push: mockPush, replace: mockReplace };
let mockSearch = "";
let mockParamsCache: { key: string; params: URLSearchParams } | null = null;

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  // stable identity per query string, like the real hook
  useSearchParams: () => {
    if (!mockParamsCache || mockParamsCache.key !== mockSearch) {
      mockParamsCache = { key: mockSearch, params: new URLSearchParams(mockSearch) };
    }
    return mockParamsCache.params;
  },
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={typeof alt === "string" ? alt : ""} src={typeof src === "string" ? src : ""} />
    );
  },
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin, user: null, token: null, loading: false }),
}));

// --- fetch mock (the real httpClient runs on top of it) ---------------------

interface Reply {
  status?: number;
  body?: unknown;
  /** Non-JSON body (nginx / Cloudflare error page). */
  html?: string;
  headers?: Record<string, string>;
}

function reply({ status = 200, body = {}, html, headers = {} }: Reply) {
  const lower: Record<string, string> = {};
  Object.entries(headers).forEach(([k, v]) => (lower[k.toLowerCase()] = v));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: html !== undefined ? "Bad Gateway" : "OK",
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    json: async () => {
      if (html !== undefined) throw new SyntaxError("Unexpected token '<'");
      return body;
    },
    text: async () => (html !== undefined ? html : JSON.stringify(body)),
  } as unknown as Response;
}

// Replies are queued per URL path: the upgraded httpClient also POSTs failure
// beacons to /api/auth/client-event/, so call order cannot be relied upon.
type Queued = Response | Error | Promise<Response>;
const LOGIN = "/api/auth/login/";
const REGISTER = "/api/auth/register/";
const RESEND = "/api/auth/resend-verification/";
const RESET = "/api/auth/password-reset/";
const routes: Record<string, Queued[]> = {};
const fetchMock = jest.fn();

function queue(path: string, ...replies: Queued[]) {
  (routes[path] ??= []).push(...replies);
}

function routedFetch(url: RequestInfo | URL): Promise<Response> {
  const target = String(url);
  if (target.includes("/api/auth/client-event/")) {
    return Promise.resolve(reply({ status: 204 }));
  }
  const key = Object.keys(routes).find((path) => target.includes(path));
  const next = key ? routes[key].shift() : undefined;
  if (next === undefined) {
    return Promise.reject(new Error(`Unexpected fetch: ${target}`));
  }
  return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
}

const callsTo = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(path));

const bodyOf = (path: string, index = 0) =>
  JSON.parse(callsTo(path)[index][1].body as string);

const deferred = () => {
  let release: (r: Response) => void = () => {};
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
};

// --- page helpers -------------------------------------------------------------

const flush = () => act(async () => {});
const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
const type = (id: string, value: string) =>
  fireEvent.change($(id), { target: { value } });
const submit = () =>
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);

function renderAuth(query = "") {
  mockSearch = query;
  return render(<Auth />);
}

function fillSignIn(email = "jo.smith@example.com", password = "Passw0rd!x") {
  type("email", email);
  type("password", password);
}

function fillSignUp(
  overrides: Partial<
    Record<"first_name" | "surname" | "email" | "password" | "confirmPassword", string>
  > = {}
) {
  const values = {
    first_name: "Jo",
    surname: "Smith",
    email: "jo.smith@example.com",
    password: "Passw0rd!x",
    confirmPassword: "Passw0rd!x",
    ...overrides,
  };
  Object.entries(values).forEach(([id, value]) => type(id, value));
}

const user = {
  id: 1,
  name: "Jo Smith",
  first_name: "Jo",
  surname: "Smith",
  email: "jo.smith@example.com",
};

const registered = (extra: Record<string, unknown> = {}) =>
  reply({
    status: 201,
    body: {
      message: "User created successfully.",
      email_verification_required: true,
      email_queued: true,
      email_sent: false,
      resumed: false,
      user,
      ...extra,
    },
  });

const unverified = (extra: Record<string, unknown> = {}) =>
  reply({
    body: {
      message: "Please verify your email address before logging in",
      code: "email_not_verified",
      email_verification_required: true,
      user,
      ...extra,
    },
  });

const submitButton = (name: RegExp | string = "Sign in") =>
  screen.getByRole("button", { name });

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(routes).forEach((path) => delete routes[path]);
  fetchMock.mockReset();
  fetchMock.mockImplementation(routedFetch);
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("Auth page: sign-up", () => {
  it("sends the normalised email but leaves the field as typed", async () => {
    queue(REGISTER, registered());
    renderAuth("mode=signup");
    fillSignUp({ email: "  Jo.Smith@Example.COM\u200B ", first_name: " Jo ", surname: "Smith " });
    submit();
    await flush();

    expect(callsTo(REGISTER)).toHaveLength(1);
    expect(bodyOf(REGISTER)).toEqual({
      first_name: "Jo",
      surname: "Smith",
      email: "jo.smith@example.com",
      password: "Passw0rd!x",
    });
    // shown as typed (type=email itself trims surrounding spaces); only the
    // request carries the canonical form
    expect($("email").value).toBe("Jo.Smith@Example.COM\u200B");
  });

  it("accepts a fullwidth email by sending its canonical form", async () => {
    queue(REGISTER, registered());
    renderAuth("mode=signup");
    fillSignUp({
      email: "\uFF4A\uFF4F\uFF20\uFF45\uFF58\uFF41\uFF4D\uFF50\uFF4C\uFF45\uFF0E\uFF43\uFF4F\uFF4D",
    });
    submit();
    await flush();
    expect(bodyOf(REGISTER).email).toBe("jo@example.com");
  });

  it("tells the customer a link was sent when the email was queued", async () => {
    queue(REGISTER, registered({ email_queued: true }));
    renderAuth("mode=signup");
    fillSignUp();
    submit();
    await flush();

    expect(screen.getByText("Check Your Email")).toBeInTheDocument();
    expect(screen.getByText(/We've sent a verification link to/i)).toBeInTheDocument();
    expect(screen.getByText("jo.smith@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't send/i)).toBeNull();
  });

  it("says the email could not be sent when email_queued is false", async () => {
    queue(REGISTER, registered({ email_queued: false }));
    renderAuth("mode=signup");
    fillSignUp();
    submit();
    await flush();

    expect(screen.getByText("Account Created")).toBeInTheDocument();
    expect(screen.getByText(/couldn't send the verification email to/i)).toBeInTheDocument();
    expect(screen.queryByText(/We've sent a verification link/i)).toBeNull();
    const resend = screen.getByRole("button", { name: /resend verification email/i });
    expect(resend).toBeEnabled();

    // ... and the highlighted Resend button really sends it
    queue(RESEND, reply({ body: { message: "ok" } }));
    fireEvent.click(resend);
    await flush();
    expect(bodyOf(RESEND)).toEqual({ email: "jo.smith@example.com" });
    expect(screen.getByText("Check Your Email")).toBeInTheDocument();
  });

  it("treats a resumed sign-up like a success", async () => {
    queue(REGISTER, registered({ resumed: true, email_queued: true, message: "Welcome back" }));
    renderAuth("mode=signup");
    fillSignUp();
    submit();
    await flush();
    expect(screen.getByText("Check Your Email")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a missing email_queued flag as queued (older backend)", async () => {
    queue(REGISTER, reply({ status: 201, body: { email_verification_required: true, user } }));
    renderAuth("mode=signup");
    fillSignUp();
    submit();
    await flush();
    expect(screen.getByText("Check Your Email")).toBeInTheDocument();
  });

  it("offers Sign in / Reset password when the account already exists", async () => {
    queue(REGISTER, reply({ status: 400, body: { error: "backend wording", code: "email_exists" } }));
    renderAuth("mode=signup&next=%2Fcart");
    fillSignUp();
    submit();
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
    const signIn = screen.getByRole("button", { name: "Sign in instead" });
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();

    fireEvent.click(signIn);
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
    expect($("email").value).toBe("jo.smith@example.com");
    expect($("first_name")).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/auth?mode=signin&next=%2Fcart");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the reset-password dialog prefilled from the duplicate notice", async () => {
    queue(REGISTER, reply({ status: 400, body: { error: "x", code: "email_exists" } }));
    renderAuth("mode=signup");
    fillSignUp();
    submit();
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Reset Your Password")).toBeInTheDocument();
    expect($("forgot-email").value).toBe("jo.smith@example.com");
  });

  it("does not call the API when local validation fails", async () => {
    renderAuth("mode=signup");
    fillSignUp({ confirmPassword: "different1" });
    submit();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(callsTo(REGISTER)).toHaveLength(0);

    type("confirmPassword", "Passw0rd!x");
    type("email", "not-an-email");
    submit();
    await flush();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/valid email/i);
    expect(callsTo(REGISTER)).toHaveLength(0);
  });

  it("rejects disposable addresses locally", async () => {
    renderAuth("mode=signup");
    fillSignUp({ email: "jo@mailinator.com" });
    submit();
    await flush();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/disposable/i);
    expect(callsTo(REGISTER)).toHaveLength(0);
  });

  describe("register failures", () => {
    it("explains that the account may exist after a network failure", async () => {
      queue(REGISTER, new TypeError("Load failed"));
      renderAuth("mode=signup");
      fillSignUp();
      submit();
      await flush();
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/account may have been created/i);
      expect(alert).toHaveTextContent(/safe to submit the same details again/i);
      // the very same details can be submitted again
      queue(REGISTER, registered({ resumed: true }));
      submit();
      await flush();
      expect(callsTo(REGISTER)).toHaveLength(2);
      expect(screen.getByText("Check Your Email")).toBeInTheDocument();
    });

    it("shows the server's validation message", async () => {
      queue(
        REGISTER,
        reply({
          status: 400,
          body: { error: "This password is too common.", code: "validation_error", field: "password" },
        })
      );
      renderAuth("mode=signup");
      fillSignUp();
      submit();
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent("This password is too common.");
    });

    it("marks the email field when the server rejects the email", async () => {
      queue(
        REGISTER,
        reply({
          status: 400,
          body: { error: "Enter a valid email address", code: "validation_error", field: "email" },
        })
      );
      renderAuth("mode=signup");
      fillSignUp();
      submit();
      await flush();
      expect($("email")).toHaveAttribute("aria-invalid", "true");
    });

    it("hides a 502 page behind a friendly message and re-enables the button", async () => {
      queue(REGISTER, reply({ status: 502, html: "<html>502 Bad Gateway</html>" }));
      renderAuth("mode=signup");
      fillSignUp();
      submit();
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/Something went wrong on our side/i);
      expect(document.body).not.toHaveTextContent(/HTTP 502|Bad Gateway/);
      expect(submitButton("Create account")).toBeEnabled();
    });
  });

  describe("typo suggestion", () => {
    it("asks before creating an account with a mistyped domain", async () => {
      renderAuth("mode=signup");
      fillSignUp({ email: "Test@GMIAL.com" });
      submit();
      await flush();

      expect(callsTo(REGISTER)).toHaveLength(0);
      expect(screen.getByText("Did you mean test@gmail.com?")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Use test@gmail.com" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Keep as typed" })).toBeInTheDocument();
    });

    it("replaces the email when the suggestion is used", async () => {
      queue(REGISTER, registered());
      renderAuth("mode=signup");
      fillSignUp({ email: "test@gmial.com" });
      submit();
      await flush();

      fireEvent.click(screen.getByRole("button", { name: "Use test@gmail.com" }));
      expect($("email").value).toBe("test@gmail.com");
      expect(screen.queryByText(/did you mean/i)).toBeNull();
      expect(callsTo(REGISTER)).toHaveLength(0);

      submit();
      await flush();
      expect(bodyOf(REGISTER).email).toBe("test@gmail.com");
    });

    it("carries on with the typed address after Keep as typed", async () => {
      queue(REGISTER, registered());
      renderAuth("mode=signup");
      fillSignUp({ email: "test@gmial.com" });
      submit();
      await flush();

      fireEvent.click(screen.getByRole("button", { name: "Keep as typed" }));
      await flush();
      expect(callsTo(REGISTER)).toHaveLength(1);
      expect(bodyOf(REGISTER).email).toBe("test@gmial.com");
      expect(screen.queryByText(/did you mean/i)).toBeNull();
      expect(screen.getByText("Check Your Email")).toBeInTheDocument();
    });

    it("does not ask again once the address was acknowledged", async () => {
      queue(REGISTER, reply({ status: 500, body: { code: "server_error" } }), registered());
      renderAuth("mode=signup");
      fillSignUp({ email: "test@gmial.com" });
      submit();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Keep as typed" }));
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/went wrong on our side/i);

      submit(); // retry: no second question
      await flush();
      expect(screen.queryByText(/did you mean/i)).toBeNull();
      expect(callsTo(REGISTER)).toHaveLength(2);
    });

    it("hides the notice when the email is edited", async () => {
      renderAuth("mode=signup");
      fillSignUp({ email: "test@gmial.com" });
      submit();
      await flush();
      expect(screen.getByText(/did you mean/i)).toBeInTheDocument();
      type("email", "test@gmial.co");
      expect(screen.queryByText(/did you mean/i)).toBeNull();
    });

    it("does not question a sign-in", async () => {
      queue(LOGIN, reply({ status: 401, body: { code: "account_not_found", suggestion: "create_account" } }));
      renderAuth();
      fillSignIn("test@gmial.com");
      submit();
      await flush();
      expect(screen.queryByText(/did you mean/i)).toBeNull();
      expect(callsTo(LOGIN)).toHaveLength(1);
      expect(bodyOf(LOGIN).email).toBe("test@gmial.com");
    });
  });
});

describe("Auth page: in-flight guard", () => {
  it("sends exactly one register request for two submit events", async () => {
    const pending = deferred();
    queue(REGISTER, pending.promise);
    renderAuth("mode=signup");
    fillSignUp();
    submit();
    submit();
    submit();
    expect(callsTo(REGISTER)).toHaveLength(1);

    await act(async () => pending.release(registered()));
    expect(callsTo(REGISTER)).toHaveLength(1);
    expect(screen.getByText("Check Your Email")).toBeInTheDocument();
  });

  it("sends exactly one login request for two submit events", async () => {
    const pending = deferred();
    queue(LOGIN, pending.promise);
    renderAuth();
    fillSignIn();
    submit();
    submit();
    expect(callsTo(LOGIN)).toHaveLength(1);
    expect(submitButton(/signing in/i)).toBeDisabled();

    await act(async () =>
      pending.release(reply({ body: { message: "Login successful", access: "jwt", user } }))
    );
    expect(callsTo(LOGIN)).toHaveLength(1);
  });

  it("lets the customer submit again after a failure", async () => {
    queue(LOGIN, reply({ status: 401, body: { code: "invalid_password" } }));
    renderAuth();
    fillSignIn();
    submit();
    await flush();
    expect(callsTo(LOGIN)).toHaveLength(1);

    queue(LOGIN, reply({ status: 401, body: { code: "invalid_password" } }));
    submit();
    await flush();
    expect(callsTo(LOGIN)).toHaveLength(2);
  });
});

describe("Auth page: sign-in", () => {
  it("logs in with the normalised email and follows a safe next path", async () => {
    queue(LOGIN, reply({ body: { message: "Login successful", access: "jwt-token", user } }));
    renderAuth("next=%2Fcart");
    fillSignIn("  Jo.Smith@EXAMPLE.com ");
    submit();
    await flush();

    expect(bodyOf(LOGIN)).toEqual({ email: "jo.smith@example.com", password: "Passw0rd!x" });
    expect(mockLogin).toHaveBeenCalledWith({ access: "jwt-token" }, user);
    expect(mockReplace).toHaveBeenCalledWith("/cart");
  });

  it("prefills the email from the verification redirect", () => {
    renderAuth("mode=signin&email=jo%40example.com&verified=true");
    expect($("email").value).toBe("jo@example.com");
    expect(screen.getByRole("status")).toHaveTextContent(/Email verified successfully/i);
  });

  describe("server outcomes", () => {
    const timeout = Object.assign(new Error("Request timed out"), {
      name: "FetchTimeoutError",
    });
    const table: Array<[string, Queued, RegExp]> = [
      ["502 HTML", reply({ status: 502, html: "<html>502 Bad Gateway</html>" }), /Something went wrong on our side/i],
      ["503 HTML", reply({ status: 503, html: "<html>503 Service Unavailable</html>" }), /Something went wrong on our side/i],
      [
        "500 with a reference",
        reply({ status: 500, body: { error: "An error occurred", code: "server_error", request_id: "abcdef0123456789" } }),
        /Something went wrong on our side.*Reference: abcdef0123456789/i,
      ],
      [
        "401 wrong password",
        reply({ status: 401, body: { error: "Invalid password for this email address", code: "invalid_password" } }),
        /Incorrect password/i,
      ],
      [
        "403 inactive account",
        reply({ status: 403, body: { error: "Account is inactive", code: "account_inactive" } }),
        /inactive.*contact support/i,
      ],
      ["network failure", new TypeError("Load failed"), /check your connection/i],
      ["timeout", timeout, /timed out/i],
    ];

    it.each(table)("shows a clear message for %s", async (_name, response, pattern) => {
      queue(LOGIN, response);
      renderAuth();
      fillSignIn();
      submit();
      await flush();

      expect(screen.getByRole("alert")).toHaveTextContent(pattern);
      expect(document.body).not.toHaveTextContent(/HTTP \d{3}|Bad Gateway|Service Unavailable|Login failed/);
      expect(submitButton("Sign in")).toBeEnabled();
    });

    it("links to support for an inactive account", async () => {
      queue(LOGIN, reply({ status: 403, body: { error: "x", code: "account_inactive" } }));
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      expect(screen.getByRole("link", { name: /contact support/i })).toHaveAttribute("href", "/contact");
    });

    it("suggests creating an account when it does not exist", async () => {
      queue(
        LOGIN,
        reply({
          status: 401,
          body: { error: "backend wording", code: "account_not_found", suggestion: "create_account" },
        })
      );
      renderAuth("mode=signin");
      fillSignIn();
      submit();
      await flush();

      expect(screen.getByRole("alert")).toHaveTextContent(
        "No account found with this email address. Would you like to create an account?"
      );
      fireEvent.click(screen.getByRole("button", { name: "create an account" }));
      expect(screen.getByText("Create your account")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("drives the create-account suggestion from the code, not from wording", async () => {
      // wording that used to trigger the old substring check must not matter
      queue(LOGIN, reply({ status: 401, body: { error: "You could create an account", code: "invalid_password" } }));
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      expect(screen.queryByRole("button", { name: "create an account" })).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(/Incorrect password/i);
    });

    it("counts down a rate limit on the disabled submit button", async () => {
      jest.useFakeTimers();
      queue(
        LOGIN,
        reply({
          status: 429,
          body: { error: "x", detail: "x", code: "rate_limited", retry_after: 30 },
          headers: { "Retry-After": "30" },
        })
      );
      renderAuth();
      fillSignIn();
      submit();
      await flush();

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many attempts. Please wait 30 seconds and try again."
      );
      expect(submitButton(/try again in 30s/i)).toBeDisabled();

      // a submit event while limited sends nothing
      submit();
      await flush();
      expect(callsTo(LOGIN)).toHaveLength(1);

      act(() => {
        jest.advanceTimersByTime(29_000);
      });
      expect(submitButton(/try again in 1s/i)).toBeDisabled();
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(submitButton("Sign in")).toBeEnabled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("never shows the raw DRF throttle text", async () => {
      queue(
        LOGIN,
        reply({ status: 429, body: { detail: "Request was throttled. Expected available in 42 seconds." } })
      );
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      expect(document.body).not.toHaveTextContent(/Request was throttled/);
      expect(screen.getByRole("alert")).toHaveTextContent(/Too many attempts/);
    });
  });

  describe("unverified account", () => {
    it("shows a warning (not the green success box) with a Resend button", async () => {
      queue(LOGIN, unverified());
      renderAuth();
      fillSignIn("  Jo.Smith@Example.COM ");
      submit();
      await flush();

      expect(bodyOf(LOGIN).email).toBe("jo.smith@example.com");
      const boxes = screen.getAllByRole("status");
      expect(boxes).toHaveLength(1);
      expect(boxes[0]).toHaveTextContent(/Please verify your email address/i);
      expect(boxes[0]).toHaveTextContent("jo.smith@example.com");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("also recognises the older response without a code", async () => {
      queue(LOGIN, reply({ body: { message: "Please verify", email_verification_required: true, user } }));
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      expect(screen.getByRole("button", { name: "Resend verification email" })).toBeInTheDocument();
    });

    it("keeps the Resend button after a resend and calls the endpoint with the normalised email", async () => {
      jest.useFakeTimers();
      queue(LOGIN, unverified());
      queue(RESEND, reply({ body: { message: "ok", cooldown_total: 60, next_request_allowed_in: 60 } }));
      renderAuth();
      fillSignIn("  Jo.Smith@Example.COM ");
      submit();
      await flush();

      fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
      await flush();

      expect(callsTo(RESEND)).toHaveLength(1);
      expect(bodyOf(RESEND)).toEqual({ email: "jo.smith@example.com" });
      const box = screen.getByRole("status");
      expect(box).toHaveTextContent(/We've sent a new link to jo.smith@example.com/i);
      // persistent, cooldown-aware
      const resend = screen.getByRole("button", { name: "Resend verification email" });
      expect(resend).toBeDisabled();
      expect(box).toHaveTextContent(/Resend available in 60 seconds/i);

      act(() => {
        jest.advanceTimersByTime(60_000);
      });
      expect(screen.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
      expect(screen.queryByText(/Resend available in/i)).toBeNull();
    });

    it("says the resend could not be queued when email_queued is false", async () => {
      queue(LOGIN, unverified());
      queue(RESEND, reply({ body: { message: "ok", email_queued: false } }));
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/could not send the verification email/i);
    });

    it("sends exactly one resend request for repeated clicks", async () => {
      queue(LOGIN, unverified());
      const pending = deferred();
      queue(RESEND, pending.promise);
      renderAuth();
      fillSignIn();
      submit();
      await flush();

      const button = screen.getByRole("button", { name: "Resend verification email" });
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      expect(callsTo(RESEND)).toHaveLength(1);
      await act(async () => pending.release(reply({ body: { message: "ok" } })));
      expect(callsTo(RESEND)).toHaveLength(1);
    });

    it("shows a cooldown as a countdown, not as a failure", async () => {
      queue(LOGIN, unverified());
      queue(
        RESEND,
        reply({ status: 429, body: { error: "x", code: "cooldown", cooldown_remaining: 42, cooldown_total: 60 } })
      );
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
      await flush();

      expect(screen.getByRole("status")).toHaveTextContent(/Resend available in 42 seconds/i);
      expect(screen.getByRole("button", { name: "Resend verification email" })).toBeDisabled();
      expect(document.body).not.toHaveTextContent(/Failed to resend/i);
    });

    it("shows a rate limit of the resend endpoint as a wait", async () => {
      queue(LOGIN, unverified());
      queue(RESEND, reply({ status: 429, body: { code: "rate_limited", retry_after: 600 } }));
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
      await flush();
      expect(screen.getByRole("status")).toHaveTextContent(/Resend available in 10 minutes/i);
    });

    it("explains a network failure and lets the customer retry", async () => {
      queue(LOGIN, unverified());
      queue(RESEND, new TypeError("Load failed"));
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
      await flush();

      expect(screen.getByRole("alert")).toHaveTextContent(/check your connection/i);
      expect(screen.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
    });

    it("hides a 502 behind a friendly message with the reference", async () => {
      queue(LOGIN, unverified());
      queue(
        RESEND,
        reply({ status: 502, html: "<html>Bad Gateway</html>", headers: { "X-Request-ID": "abcdef0123456789" } })
      );
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
      await flush();
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/Something went wrong on our side/i);
      expect(alert).not.toHaveTextContent(/HTTP 502|Bad Gateway|Failed to resend/);
    });

    it("switches to a success notice when the account turns out to be verified", async () => {
      queue(LOGIN, unverified());
      queue(RESEND, reply({ body: { message: "Email is already verified", already_verified: true } }));
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
      await flush();

      expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent(/already verified/i);
    });

    it("hides the warning once the email is changed or the mode switches", async () => {
      queue(LOGIN, unverified());
      renderAuth();
      fillSignIn();
      submit();
      await flush();
      expect(screen.getByRole("button", { name: "Resend verification email" })).toBeInTheDocument();

      type("email", "someone.else@example.com");
      expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
      type("email", "jo.smith@example.com");
      expect(screen.getByRole("button", { name: "Resend verification email" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Create one" }));
      expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
    });

    it("replaces the warning when the next attempt fails", async () => {
      queue(LOGIN, unverified());
      renderAuth();
      fillSignIn();
      submit();
      await flush();

      queue(LOGIN, reply({ status: 401, body: { code: "invalid_password" } }));
      submit();
      await flush();
      expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent(/Incorrect password/i);
    });
  });
});

describe("Auth page: forgot password", () => {
  const openModal = () =>
    fireEvent.click(screen.getByRole("button", { name: /forgot your password/i }));
  const sendButton = () => screen.getByRole("button", { name: /send reset link|sending/i });

  it("prefills the typed email and posts the normalised one with a timeout", async () => {
    queue(RESET, reply({ body: { message: "If the email exists...", cooldown_total: 60, next_request_allowed_in: 60 } }));
    renderAuth();
    type("email", "  Jo.Smith@Example.COM ");
    openModal();
    expect($("forgot-email").value).toBe("Jo.Smith@Example.COM");

    fireEvent.click(sendButton());
    await flush();

    expect(callsTo(RESET)).toHaveLength(1);
    expect(bodyOf(RESET)).toEqual({ email: "jo.smith@example.com" });
    // fetchWithTimeout attaches an abort signal
    expect(callsTo(RESET)[0][1].signal).toBeDefined();
    expect(screen.getByText("Check Your Email")).toBeInTheDocument();
  });

  it("sends exactly one request for repeated clicks", async () => {
    const pending = deferred();
    queue(RESET, pending.promise);
    renderAuth();
    type("email", "jo@example.com");
    openModal();

    const button = sendButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(callsTo(RESET)).toHaveLength(1);
    await act(async () => pending.release(reply({ body: { message: "ok" } })));
    expect(callsTo(RESET)).toHaveLength(1);
  });

  it("requires an email", async () => {
    renderAuth();
    openModal();
    fireEvent.click(sendButton());
    await flush();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(callsTo(RESET)).toHaveLength(0);
  });

  it("shows a cooldown as a live wait under the buttons", async () => {
    queue(
      RESET,
      reply({ status: 429, body: { error: "x", code: "cooldown", cooldown_remaining: 45, cooldown_total: 60 } })
    );
    renderAuth();
    type("email", "jo@example.com");
    openModal();
    fireEvent.click(sendButton());
    await flush();

    expect(screen.getByText(/Please wait 45 seconds before requesting another reset link/i)).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    expect(document.body).not.toHaveTextContent(/Failed to send password reset email/);
  });

  it("shows a rate limit as a wait in minutes", async () => {
    queue(RESET, reply({ status: 429, body: { code: "rate_limited", retry_after: 900 } }));
    renderAuth();
    type("email", "jo@example.com");
    openModal();
    fireEvent.click(sendButton());
    await flush();
    expect(screen.getByText(/Please wait 15 minutes before requesting another reset link/i)).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it("hides an nginx error page behind a friendly message", async () => {
    queue(RESET, reply({ status: 502, html: "<html>Bad Gateway</html>" }));
    renderAuth();
    type("email", "jo@example.com");
    openModal();
    fireEvent.click(sendButton());
    await flush();
    expect(screen.getByText(/Something went wrong on our side/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/HTTP 502|Bad Gateway|Failed to send password reset email/);
    expect(sendButton()).toBeEnabled();
  });

  it("explains a network failure", async () => {
    queue(RESET, new TypeError("Failed to fetch"));
    renderAuth();
    type("email", "jo@example.com");
    openModal();
    fireEvent.click(sendButton());
    await flush();
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
  });

  it("opens automatically from the forgotPassword query parameter", () => {
    renderAuth("forgotPassword=true");
    expect(screen.getByText("Reset Your Password")).toBeInTheDocument();
  });
});
