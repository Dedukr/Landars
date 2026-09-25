import "@testing-library/jest-dom";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import VerifyEmailPage from "../page";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockLogin = jest.fn();
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

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin, user: null, token: null, logout: jest.fn(), loading: false }),
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
const VERIFY = "/api/auth/verify-email/";
const RESEND = "/api/auth/resend-verification/";
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

const flush = () => act(async () => {});

let tokenSeq = 0;
/** The page keeps one promise per token, so every test uses its own token. */
function renderVerify(extraQuery = "", options: { token?: string | null } = {}) {
  const token = options.token === undefined ? `tok-${++tokenSeq}` : options.token;
  mockSearch = [token ? `token=${token}` : "", extraQuery]
    .filter(Boolean)
    .join("&");
  return render(<VerifyEmailPage />);
}

const user = { id: 7, name: "Ann", email: "ann@example.com" };
const expiredBody = {
  error: "backend wording",
  code: "token_expired",
  email: "ann@example.com",
  can_resend: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLogin.mockReset();
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

describe("VerifyEmailPage", () => {
  describe("success", () => {
    it("verifies once and redirects to sign-in with the email", async () => {
      jest.useFakeTimers();
      queue(VERIFY, reply({ body: { message: "Email verified successfully", already_verified: false, user } }));
      const { token } = { token: "tok-success" };
      renderVerify("", { token });
      await flush();

      expect(screen.getByRole("heading", { name: /email verified/i })).toBeInTheDocument();
      expect(screen.getByText("Email verified successfully")).toBeInTheDocument();
      expect(callsTo(VERIFY)).toHaveLength(1);
      expect(bodyOf(VERIFY)).toEqual({ token });

      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(mockPush).toHaveBeenCalledWith(
        "/auth?mode=signin&email=ann%40example.com&verified=true"
      );
    });

    it("never signs in from the verify response, even if it carries an access token", async () => {
      // Verifying an address must not log the browser in (login-CSRF via an attacker's
      // link, and old links would become credentials): always go through sign-in.
      jest.useFakeTimers();
      queue(
        VERIFY,
        reply({
          body: {
            message: "Email verified successfully",
            already_verified: false,
            user,
            access: "access-from-verify",
          },
        })
      );
      renderVerify("next=%2Fcart", { token: "tok-jwt" });
      await flush();

      expect(mockLogin).not.toHaveBeenCalled();
      expect(screen.getByText(/redirecting to sign in/i)).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith(
        "/auth?mode=signin&next=%2Fcart&email=ann%40example.com&verified=true"
      );
    });

    it("treats an already verified account as success", async () => {
      queue(
        VERIFY,
        reply({
          body: { message: "Your email is already verified", already_verified: true, user },
        })
      );
      renderVerify();
      await flush();
      expect(screen.getByRole("heading", { name: /email verified/i })).toBeInTheDocument();
      expect(screen.getByText("Your email is already verified")).toBeInTheDocument();
      expect(screen.getByText(/redirecting to sign in/i)).toBeInTheDocument();
    });

    it("keeps a safe next path in the redirect", async () => {
      jest.useFakeTimers();
      queue(VERIFY, reply({ body: { message: "ok", user } }));
      renderVerify("next=%2Fcart");
      await flush();
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(mockPush).toHaveBeenCalledWith(
        "/auth?mode=signin&next=%2Fcart&email=ann%40example.com&verified=true"
      );
    });

    it("posts only once under React Strict Mode", async () => {
      queue(VERIFY, reply({ body: { message: "ok", user } }));
      mockSearch = "token=tok-strict";
      render(
        <React.StrictMode>
          <VerifyEmailPage />
        </React.StrictMode>
      );
      await flush();
      expect(callsTo(VERIFY)).toHaveLength(1);
      expect(screen.getByRole("heading", { name: /email verified/i })).toBeInTheDocument();
    });
  });

  describe("expired or used link", () => {
    it("offers a Resend button when the API told us the email", async () => {
      queue(VERIFY, reply({ status: 400, body: expiredBody }));
      queue(RESEND, reply({ body: { message: "ok", next_request_allowed_in: 60 } }));
      renderVerify();
      await flush();

      expect(
        screen.getByRole("heading", { name: /link expired or already used/i })
      ).toBeInTheDocument();
      expect(screen.getByText(/has expired/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/email address/i)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
      await flush();

      expect(callsTo(RESEND)).toHaveLength(1);
      expect(bodyOf(RESEND)).toEqual({ email: "ann@example.com" });
      expect(screen.getByRole("status")).toHaveTextContent(
        /We've sent a new link to ann@example.com/i
      );
      // server-announced cooldown
      expect(screen.getByText(/request another link in 60 seconds/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /resend verification email/i })).toBeDisabled();
    });

    it("tells the truth when email_queued is false", async () => {
      queue(VERIFY, reply({ status: 400, body: expiredBody }));
      queue(RESEND, reply({ body: { message: "ok", email_queued: false } }));
      renderVerify();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/could not send the verification email/i);
    });

    it("lets the customer type an email when it is unknown", async () => {
      queue(VERIFY, reply({ status: 400, body: { error: "x", code: "token_invalid", can_resend: false } }));
      queue(RESEND, reply({ body: { message: "ok" } }));
      renderVerify();
      await flush();

      expect(screen.getByText(/invalid or has already been used/i)).toBeInTheDocument();
      const input = screen.getByLabelText(/email address/i);
      fireEvent.change(input, { target: { value: "  New@Example.COM\u200B " } });
      fireEvent.submit(input.closest("form") as HTMLFormElement);
      await flush();

      expect(callsTo(RESEND)).toHaveLength(1);
      expect(bodyOf(RESEND)).toEqual({ email: "new@example.com" });
      expect(screen.getByRole("status")).toHaveTextContent(/We've sent a new link to new@example.com/i);
    });

    it("validates the typed email before calling the API", async () => {
      queue(VERIFY, reply({ status: 400, body: { code: "token_invalid" } }));
      renderVerify();
      await flush();

      fireEvent.click(screen.getByRole("button", { name: /send me a new link/i }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/email address is required/i);
      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "not-an-email" } });
      fireEvent.click(screen.getByRole("button", { name: /send me a new link/i }));
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i);
      expect(callsTo(RESEND)).toHaveLength(0);
    });

    it("sends one resend request even if the button is hit repeatedly", async () => {
      queue(VERIFY, reply({ status: 400, body: expiredBody }));
      let release: (r: Response) => void = () => {};
      queue(RESEND, new Promise<Response>((resolve) => (release = resolve)));
      renderVerify();
      await flush();

      const button = screen.getByRole("button", { name: /resend verification email/i });
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      expect(callsTo(RESEND)).toHaveLength(1);
      await act(async () => release(reply({ body: { message: "ok" } })));
      expect(callsTo(RESEND)).toHaveLength(1);
    });

    it("guards the typed-email form against a double submit", async () => {
      queue(VERIFY, reply({ status: 400, body: { code: "token_invalid" } }));
      let release: (r: Response) => void = () => {};
      queue(RESEND, new Promise<Response>((resolve) => (release = resolve)));
      renderVerify();
      await flush();

      const input = screen.getByLabelText(/email address/i);
      fireEvent.change(input, { target: { value: "new@example.com" } });
      const form = input.closest("form") as HTMLFormElement;
      fireEvent.submit(form);
      fireEvent.submit(form);
      expect(callsTo(RESEND)).toHaveLength(1);
      await act(async () => release(reply({ body: { message: "ok" } })));
    });

    it("shows a cooldown from the resend endpoint as a wait, not a failure", async () => {
      queue(VERIFY, reply({ status: 400, body: expiredBody }));
      queue(
        RESEND,
        reply({ status: 429, body: { error: "wait", code: "cooldown", cooldown_remaining: 30 } })
      );
      renderVerify();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
      await flush();

      expect(screen.getByText(/request another link in 30 seconds/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /resend verification email/i })).toBeDisabled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows a friendly message when the resend fails on the server", async () => {
      queue(VERIFY, reply({ status: 400, body: expiredBody }));
      queue(RESEND, reply({ status: 502, html: "<html>Bad Gateway</html>" }));
      renderVerify();
      await flush();
      fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
      await flush();

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/Something went wrong on our side/i);
      expect(alert).not.toHaveTextContent(/HTTP 502|Bad Gateway/);
    });

    it("recognises a link problem by status when an older backend sends no code", async () => {
      queue(
        VERIFY,
        reply({
          status: 400,
          body: {
            error: "Verification token has expired or has already been used",
            email: "ann@example.com",
            can_resend: true,
          },
        })
      );
      renderVerify();
      await flush();
      expect(
        screen.getByRole("heading", { name: /link expired or already used/i })
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /resend verification email/i })).toBeInTheDocument();
    });

    it("treats can_resend:false with a known email as already verified", async () => {
      queue(
        VERIFY,
        reply({
          status: 400,
          body: { error: "used", email: "ann@example.com", can_resend: false },
        })
      );
      renderVerify();
      await flush();
      expect(screen.getByRole("heading", { name: /email verified/i })).toBeInTheDocument();
    });

    it("asks for the email when the link has no token at all", async () => {
      renderVerify("", { token: null });
      await flush();
      expect(callsTo(VERIFY)).toHaveLength(0);
      expect(screen.getByText(/link is incomplete/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /send me a new link/i })).toBeInTheDocument();
    });
  });

  describe("transient failures", () => {
    it("re-runs the verification with Try again after a network error", async () => {
      queue(VERIFY, new TypeError("Load failed"), reply({ body: { message: "Email verified successfully", user } }));
      renderVerify();
      await flush();

      expect(screen.getByRole("alert")).toHaveTextContent(/check your connection/i);
      expect(screen.queryByRole("heading", { name: /link expired/i })).toBeNull();
      expect(callsTo(VERIFY)).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: /^try again$/i }));
      await flush();

      expect(callsTo(VERIFY)).toHaveLength(2);
      // the very same token is retried (a failed attempt does not consume it)
      expect(bodyOf(VERIFY, 1)).toEqual(bodyOf(VERIFY, 0));
      expect(screen.getByRole("heading", { name: /email verified/i })).toBeInTheDocument();
    });

    it("offers Try again after a timeout", async () => {
      const timeout = new Error("Request timed out");
      timeout.name = "FetchTimeoutError";
      queue(VERIFY, timeout);
      renderVerify();
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/timed out/i);
      expect(screen.getByRole("button", { name: /^try again$/i })).toBeInTheDocument();
    });

    it.each([502, 503])("hides an HTML %s behind a friendly message", async (status) => {
      queue(VERIFY, reply({ status, html: "<html>error page</html>" }));
      renderVerify();
      await flush();
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/Something went wrong on our side/i);
      expect(alert).not.toHaveTextContent(/HTTP 50|Bad Gateway/);
      expect(screen.getByRole("button", { name: /^try again$/i })).toBeInTheDocument();
    });

    it("shows the support reference of a 500", async () => {
      queue(
        VERIFY,
        reply({ status: 500, body: { code: "server_error", request_id: "abcdef0123456789" } })
      );
      renderVerify();
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent("Reference: abcdef0123456789");
    });

    it("waits out a rate limit before enabling Try again", async () => {
      jest.useFakeTimers();
      queue(
        VERIFY,
        reply({ status: 429, body: { error: "x", code: "rate_limited", retry_after: 30 } }),
        reply({ body: { message: "ok", user } })
      );
      renderVerify();
      await flush();

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many attempts. Please wait 30 seconds and try again."
      );
      const wait = screen.getByRole("button", { name: /try again in 30s/i });
      expect(wait).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(30_000);
      });
      const retry = screen.getByRole("button", { name: /^try again$/i });
      expect(retry).toBeEnabled();
      fireEvent.click(retry);
      await flush();
      expect(callsTo(VERIFY)).toHaveLength(2);
      expect(screen.getByRole("heading", { name: /email verified/i })).toBeInTheDocument();
    });

    it("does not offer Try again for an error a retry cannot fix", async () => {
      queue(VERIFY, reply({ status: 403, body: { detail: "Forbidden by policy" } }));
      renderVerify();
      await flush();
      expect(screen.getByRole("heading", { name: /verification failed/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /back to login/i }));
      expect(mockPush).toHaveBeenCalledWith("/auth?mode=signin");
    });
  });
});
