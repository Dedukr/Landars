import "@testing-library/jest-dom";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ResetPassword from "../page";

const mockPush = jest.fn();
const mockRouter = { push: mockPush, replace: jest.fn() };
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

// --- fetch mock (the real httpClient runs on top of it) ---------------------

interface Reply {
  status?: number;
  body?: unknown;
  /** Non-JSON body (nginx / Cloudflare error page). */
  html?: string;
}

function reply({ status = 200, body = {}, html }: Reply) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: html !== undefined ? "Bad Gateway" : "OK",
    headers: { get: () => null },
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
const VALIDATE = "/api/auth/password-reset/validate/";
const CONFIRM = "/api/auth/password-reset/confirm/";
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
  if (target.includes("/api/auth/csrf-token/")) {
    return Promise.resolve(reply({ body: { csrfToken: "test-csrf" } }));
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

const flush = () => act(async () => {});
const $ = (id: string) => document.getElementById(id) as HTMLInputElement;

const validToken = () =>
  reply({ body: { valid: true, user: { name: "Ann", email: "ann@example.com" } } });

async function renderReset(query = "token=tok-1") {
  mockSearch = query;
  render(<ResetPassword />);
  await flush();
}

function fillPasswords(password = "NewPassw0rd", confirm = password) {
  fireEvent.change($("newPassword"), { target: { value: password } });
  fireEvent.change($("confirmPassword"), { target: { value: confirm } });
}

const submit = () =>
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(routes).forEach((path) => delete routes[path]);
  fetchMock.mockReset();
  fetchMock.mockImplementation(routedFetch);
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("Reset password page: link check", () => {
  it("shows the form for a valid link and encodes the token", async () => {
    queue(VALIDATE, validToken());
    await renderReset("token=a%2Bb%2Fc");
    expect(screen.getByText("Welcome back, Ann!")).toBeInTheDocument();
    expect(String(callsTo(VALIDATE)[0][0])).toContain("token=a%2Bb%2Fc");
  });

  it("offers a new link when the token is invalid", async () => {
    queue(VALIDATE, reply({ status: 400, body: { error: "x", code: "token_invalid" } }));
    await renderReset();
    expect(screen.getByRole("heading", { name: "Invalid Reset Link" })).toBeInTheDocument();
    expect(screen.getByText(/invalid or has already been used/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Request New Reset Link" }));
    expect(mockPush).toHaveBeenCalledWith("/auth?forgotPassword=true");
  });

  it("lets the customer retry when the check failed on a server error", async () => {
    queue(VALIDATE, reply({ status: 502, html: "<html>Bad Gateway</html>" }), validToken());
    await renderReset();

    expect(
      screen.getByRole("heading", { name: "Couldn't Check Your Reset Link" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong on our side/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/HTTP 502|Bad Gateway/);

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await flush();
    expect(callsTo(VALIDATE)).toHaveLength(2);
    expect(screen.getByText("Welcome back, Ann!")).toBeInTheDocument();
  });

  it("explains a network failure and a rate limit", async () => {
    queue(VALIDATE, new TypeError("Load failed"));
    await renderReset("token=tok-net");
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
  });

  it("shows how long to wait after a rate limit", async () => {
    queue(VALIDATE, reply({ status: 429, body: { code: "rate_limited", retry_after: 120 } }));
    await renderReset("token=tok-429");
    expect(screen.getByText(/Please wait 2 minutes/i)).toBeInTheDocument();
  });

  it("asks for a new link when there is no token", async () => {
    await renderReset("");
    expect(screen.getByRole("heading", { name: "Invalid Reset Link" })).toBeInTheDocument();
    expect(callsTo(VALIDATE)).toHaveLength(0);
  });
});

describe("Reset password page: setting the password", () => {
  it("confirms the change and the verified email, then redirects", async () => {
    jest.useFakeTimers();
    queue(VALIDATE, validToken());
    queue(CONFIRM, reply({ body: { message: "Password reset successfully" } }));
    await renderReset();
    fillPasswords();
    submit();
    await flush();

    expect(screen.getByText("Password Reset Successful!")).toBeInTheDocument();
    expect(
      screen.getByText(/password has been changed and your email address is confirmed/i)
    ).toBeInTheDocument();
    expect(JSON.parse(callsTo(CONFIRM)[0][1].body as string)).toEqual({
      token: "tok-1",
      new_password: "NewPassw0rd",
    });

    expect(mockPush).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockPush).toHaveBeenCalledWith("/auth");
  });

  it("sends exactly one request for repeated submits", async () => {
    let release: (r: Response) => void = () => {};
    queue(VALIDATE, validToken());
    queue(CONFIRM, new Promise<Response>((resolve) => (release = resolve)));
    await renderReset();
    fillPasswords();
    submit();
    submit();
    submit();
    expect(callsTo(CONFIRM)).toHaveLength(1);
    await act(async () => release(reply({ body: { message: "ok" } })));
    expect(callsTo(CONFIRM)).toHaveLength(1);
  });

  it("does not call the API when the passwords differ", async () => {
    queue(VALIDATE, validToken());
    await renderReset();
    fillPasswords("NewPassw0rd", "Different1");
    submit();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(callsTo(CONFIRM)).toHaveLength(0);
  });

  it("shows the server's password message as a sentence", async () => {
    queue(VALIDATE, validToken());
    queue(
      CONFIRM,
      reply({ status: 400, body: { error: "this password is too common", code: "validation_error" } })
    );
    await renderReset();
    fillPasswords();
    submit();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("This password is too common.");
  });

  it("offers a new link when the token expired meanwhile", async () => {
    queue(VALIDATE, validToken());
    queue(CONFIRM, reply({ status: 400, body: { error: "x", code: "token_expired" } }));
    await renderReset();
    fillPasswords();
    submit();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(/reset link has expired/i);
    fireEvent.click(screen.getByRole("button", { name: "Request a new reset link" }));
    expect(mockPush).toHaveBeenCalledWith("/auth?forgotPassword=true");
  });

  it("shows a friendly server error with the support reference", async () => {
    queue(VALIDATE, validToken());
    queue(
      CONFIRM,
      reply({ status: 500, body: { code: "server_error", request_id: "abcdef0123456789" } })
    );
    await renderReset();
    fillPasswords();
    submit();
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Something went wrong on our side/i);
    // the reference is not followed by a stray full stop
    expect(alert.textContent).toMatch(/Reference: abcdef0123456789$/);
  });

  it("explains a rate limit and a network failure", async () => {
    queue(VALIDATE, validToken());
    queue(
      CONFIRM,
      reply({ status: 429, body: { code: "rate_limited", retry_after: 30 } }),
      new TypeError("Failed to fetch")
    );
    await renderReset();
    fillPasswords();
    submit();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(/Too many attempts. Please wait 30 seconds/i);

    submit();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(/check your connection/i);
  });
});
