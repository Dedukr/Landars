import "@testing-library/jest-dom";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import EmailVerificationPopup from "../EmailVerificationPopup";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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

function resendCalls() {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).includes("/api/auth/resend-verification/")
  );
}

function sentBody(callIndex = 0) {
  return JSON.parse(resendCalls()[callIndex][1].body as string);
}

const flush = () => act(async () => {});

function renderPopup(
  props: Partial<React.ComponentProps<typeof EmailVerificationPopup>> = {}
) {
  return render(
    <EmailVerificationPopup
      isOpen
      onClose={jest.fn()}
      userEmail="user@example.com"
      {...props}
    />
  );
}

const resendButton = () =>
  screen.getByRole("button", { name: /resend verification email/i });

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

describe("EmailVerificationPopup", () => {
  it("renders nothing while closed", () => {
    const { container } = renderPopup({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  describe("copy", () => {
    it("says a link was sent when the email was queued (default)", () => {
      renderPopup();
      expect(screen.getByText("Check Your Email")).toBeInTheDocument();
      expect(
        screen.getByText(/We've sent a verification link to/i)
      ).toBeInTheDocument();
      expect(screen.queryByText(/couldn't send/i)).not.toBeInTheDocument();
    });

    it("says the account exists but no email went out when emailQueued is false", () => {
      renderPopup({ emailQueued: false });
      expect(screen.getByText("Account Created")).toBeInTheDocument();
      expect(
        screen.getByText(/couldn't send the verification email to/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/automatically/i)).toBeInTheDocument();
      expect(screen.queryByText(/We've sent a verification link/i)).toBeNull();
      // the (single) Resend button is enabled and prominent
      expect(resendButton()).toBeEnabled();
      expect(screen.getAllByRole("button", { name: /resend/i })).toHaveLength(1);
    });

    it("switches to the normal copy once a resend went through", async () => {
      queue(RESEND, reply({ body: { message: "ok" } }));
      renderPopup({ emailQueued: false });
      fireEvent.click(resendButton());
      await flush();
      expect(screen.getByText("Check Your Email")).toBeInTheDocument();
      expect(screen.queryByText(/couldn't send/i)).not.toBeInTheDocument();
    });
  });

  describe("resend", () => {
    it("posts the normalised email and confirms with the address", async () => {
      queue(RESEND, reply({ body: { message: "ok" } }));
      renderPopup({ userEmail: "  User@Example.COM\u200B " });
      fireEvent.click(resendButton());
      await flush();

      expect(resendCalls()).toHaveLength(1);
      expect(sentBody()).toEqual({ email: "user@example.com" });
      expect(
        screen.getByText(/We've sent a new link to user@example.com/i)
      ).toBeInTheDocument();
    });

    it("does not claim the mail was sent when email_queued is false", async () => {
      queue(RESEND, reply({ body: { message: "ok", email_queued: false } }));
      renderPopup();
      fireEvent.click(resendButton());
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/could not send/i);
      expect(screen.queryByText(/We've sent a new link/i)).toBeNull();
    });

    it("sends exactly one request for a double click", async () => {
      let release: (r: Response) => void = () => {};
      queue(
        RESEND,
        new Promise<Response>((resolve) => (release = resolve))
      );
      renderPopup();
      const button = resendButton();
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
      expect(resendCalls()).toHaveLength(1);

      await act(async () => release(reply({ body: { message: "ok" } })));
      expect(resendCalls()).toHaveLength(1);
    });

    it("starts the cooldown the server announces after a success", async () => {
      queue(RESEND, 
        reply({ body: { message: "ok", next_request_allowed_in: 60 } })
      );
      renderPopup();
      fireEvent.click(resendButton());
      await flush();
      expect(screen.getByText(/Resend available in 60 seconds/i)).toBeInTheDocument();
      expect(resendButton()).toBeDisabled();
    });

    it("reports an already verified address instead of a sent link", async () => {
      queue(RESEND, 
        reply({ body: { message: "Email is already verified", already_verified: true } })
      );
      renderPopup();
      fireEvent.click(resendButton());
      await flush();
      expect(screen.getByText(/already verified/i)).toBeInTheDocument();
      expect(screen.queryByText(/We've sent a new link/i)).toBeNull();
    });
  });

  describe("resend failures", () => {
    it("shows a live countdown for a cooldown and disables the button", async () => {
      jest.useFakeTimers();
      queue(RESEND, 
        reply({
          status: 429,
          body: { error: "Please wait", code: "cooldown", cooldown_remaining: 30 },
        })
      );
      renderPopup();
      fireEvent.click(resendButton());
      await flush();

      expect(screen.getByText(/Resend available in 30 seconds/i)).toBeInTheDocument();
      expect(resendButton()).toBeDisabled();
      expect(screen.queryByText(/Failed to resend/i)).toBeNull();

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/Resend available in 29 seconds/i)).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(29_000);
      });
      expect(screen.queryByText(/Resend available in/i)).toBeNull();
      expect(resendButton()).toBeEnabled();
      // no stale "please wait" message after the countdown
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows a rate limit as a countdown in minutes", async () => {
      queue(RESEND, 
        reply({
          status: 429,
          body: { error: "Too many", code: "rate_limited", retry_after: 300 },
        })
      );
      renderPopup();
      fireEvent.click(resendButton());
      await flush();
      expect(screen.getByText(/Resend available in 5 minutes/i)).toBeInTheDocument();
      expect(resendButton()).toBeDisabled();
    });

    it("explains a network failure", async () => {
      queue(RESEND, new TypeError("Load failed"));
      renderPopup();
      fireEvent.click(resendButton());
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(/check your connection/i);
      expect(resendButton()).toBeEnabled();
    });

    it("hides an nginx 502 page behind a friendly message", async () => {
      queue(RESEND, 
        reply({ status: 502, html: "<html>502 Bad Gateway</html>" })
      );
      renderPopup();
      fireEvent.click(resendButton());
      await flush();
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/Something went wrong on our side/i);
      expect(alert).not.toHaveTextContent(/HTTP 502|Bad Gateway/);
      expect(alert).not.toHaveTextContent(/Failed to resend verification email/);
    });

    it("includes the support reference of a server error", async () => {
      queue(RESEND, 
        reply({
          status: 500,
          body: { error: "boom", code: "server_error", request_id: "abcdef0123456789" },
        })
      );
      renderPopup();
      fireEvent.click(resendButton());
      await flush();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Reference: abcdef0123456789"
      );
    });

    it("lets the customer retry after a failure", async () => {
      queue(
        RESEND,
        reply({ status: 503, html: "<html/>" }),
        reply({ body: { message: "ok" } })
      );
      renderPopup();
      fireEvent.click(resendButton());
      await flush();
      expect(screen.getByRole("alert")).toBeInTheDocument();

      fireEvent.click(resendButton());
      await flush();
      expect(resendCalls()).toHaveLength(2);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText(/We've sent a new link/i)).toBeInTheDocument();
    });
  });

  describe("navigation", () => {
    it("takes the customer to sign-in with the email prefilled", () => {
      const onClose = jest.fn();
      renderPopup({ onClose, next: "/cart" });
      fireEvent.click(screen.getByRole("button", { name: /go to sign in/i }));
      expect(mockPush).toHaveBeenCalledWith(
        "/auth?mode=signin&next=%2Fcart&email=user%40example.com"
      );
      expect(onClose).toHaveBeenCalled();
    });

    it("closes with Continue Later", () => {
      const onClose = jest.fn();
      renderPopup({ onClose });
      fireEvent.click(screen.getByRole("button", { name: /continue later/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
