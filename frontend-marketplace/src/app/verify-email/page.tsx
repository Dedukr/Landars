"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { httpClient } from "@/utils/httpClient";
import {
  describeAuthError,
  formatCountdown,
  formatWaitTime,
  getAuthErrorPayload,
  getAuthUrl,
  getSafeNextRedirect,
  isTransientAuthError,
  describeResendQueuedNotice,
} from "@/utils/authHelpers";
import { AUTH_FETCH_TIMEOUT_MS } from "@/utils/fetchWithTimeout";
import { normalizeEmail, validateEmail } from "@/utils/emailValidation";

interface VerificationResponse {
  message: string;
  already_verified?: boolean;
  user?: {
    id: number;
    name: string;
    first_name?: string | null;
    surname?: string | null;
    email: string;
  };
}

interface ResendResponse {
  message?: string;
  already_verified?: boolean;
  email_queued?: boolean;
  next_request_allowed_in?: number;
}

/**
 * One POST per token across Strict Mode remounts.
 * Remounts await the same in-flight (or settled) promise. A failed attempt
 * does not consume the token, so failures are forgotten and "Try again" (or a
 * later visit) posts again.
 */
const verifyPromises = new Map<string, Promise<VerificationResponse>>();

function postVerifyEmail(token: string): Promise<VerificationResponse> {
  let promise = verifyPromises.get(token);
  if (!promise) {
    const request = httpClient.post<VerificationResponse>(
      "/api/auth/verify-email/",
      { token },
      {
        skipAuth: true,
        skipCSRF: true,
        timeoutMs: AUTH_FETCH_TIMEOUT_MS,
      }
    );
    verifyPromises.set(token, request);
    request.catch(() => {
      if (verifyPromises.get(token) === request) verifyPromises.delete(token);
    });
    promise = request;
  }
  return promise;
}

/** Seconds left until `0`, ticking once a second while positive. */
function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  const active = remaining > 0;
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);
  return [remaining, setRemaining] as const;
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const nextParam = searchParams.get("next");

  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "expired"
  >("loading");
  const [message, setMessage] = useState("");
  // The verification could not be completed but retrying may work
  const [retryable, setRetryable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [waitSeconds, setWaitSeconds] = useCountdown();
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null
  );
  // Email the API told us the link belongs to (expired / already used links)
  const [resendEmail, setResendEmail] = useState("");
  // Email typed by the customer when we do not know it
  const [typedEmail, setTypedEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [resendCooldown, setResendCooldown] = useCountdown();

  // Prevents duplicate apply/redirect scheduling within a single mount
  const appliedResultRef = useRef(false);
  // Synchronous in-flight guard for the resend actions
  const resendingRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    []
  );

  const redirectToAuth = useCallback(
    (email?: string) => {
      const safeNext = getSafeNextRedirect(nextParam);
      const authUrl = getAuthUrl({
        mode: "signin",
        next: safeNext,
      });
      const url = new URL(authUrl, window.location.origin);
      if (email) {
        url.searchParams.set("email", email);
        url.searchParams.set("verified", "true");
      }
      router.push(`${url.pathname}${url.search}`);
    },
    [nextParam, router]
  );

  const handleVerifiedSuccess = useCallback(
    (response: VerificationResponse) => {
      const verifiedUser = response.user;
      setStatus("success");
      setMessage(
        response.message ||
          (response.already_verified
            ? "Your email is already verified. You can sign in."
            : "Email verified successfully")
      );
      if (verifiedUser) {
        setUser(verifiedUser);
      }

      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);

      redirectTimerRef.current = setTimeout(() => {
        redirectToAuth(verifiedUser?.email);
      }, 3000);
    },
    [redirectToAuth]
  );

  const applyVerifyError = useCallback(
    (error: unknown) => {
      console.error("Verification error:", error);
      const described = describeAuthError(error, "verify");
      const payload = getAuthErrorPayload(error);
      const email = typeof payload?.email === "string" ? payload.email : "";

      // Link problems come from the HTTP status / `code`, never from wording:
      // 400 is what verify-email answers for a token it cannot use.
      const linkProblem =
        described.code === "token_invalid" ||
        described.code === "token_expired" ||
        (described.code === "validation_error" && described.status === 400);

      if (linkProblem) {
        // Older backends: `can_resend: false` = the account is already verified
        if (email && payload?.can_resend === false) {
          handleVerifiedSuccess({
            message: "Your email is already verified. You can sign in.",
            user: { id: 0, name: "", email },
          });
          return;
        }
        if (email) {
          setResendEmail(email);
          setUser({ name: "", email });
        }
        setStatus("expired");
        setMessage(
          described.code === "token_expired" ||
            described.code === "token_invalid"
            ? described.message
            : "This verification link has expired or has already been used."
        );
        return;
      }

      setStatus("error");
      setMessage(described.message);
      // The token is not consumed by a failed attempt, so retrying is safe
      setRetryable(isTransientAuthError(described.code));
      if (
        (described.code === "rate_limited" || described.code === "cooldown") &&
        described.retryAfter
      ) {
        setWaitSeconds(described.retryAfter);
      }
    },
    [handleVerifiedSuccess, setWaitSeconds]
  );

  // Keep latest handlers without re-firing verify when they change
  const handlersRef = useRef({
    handleVerifiedSuccess,
    applyVerifyError,
  });
  handlersRef.current = { handleVerifiedSuccess, applyVerifyError };

  useEffect(() => {
    if (!token) {
      // Mail clients sometimes cut long links: let the customer ask for a new one
      setStatus("expired");
      setMessage(
        "This verification link is incomplete. Enter your email address and we'll send you a new one."
      );
      return;
    }

    let cancelled = false;
    appliedResultRef.current = false;

    (async () => {
      try {
        const response = await postVerifyEmail(token);
        if (cancelled || appliedResultRef.current) return;
        appliedResultRef.current = true;
        handlersRef.current.handleVerifiedSuccess(response);
      } catch (error: unknown) {
        if (cancelled || appliedResultRef.current) return;
        appliedResultRef.current = true;
        handlersRef.current.applyVerifyError(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const retryVerification = () => {
    if (!token) return;
    verifyPromises.delete(token);
    setRetryable(false);
    setWaitSeconds(0);
    setStatus("loading");
    setAttempt((n) => n + 1);
  };

  const resendVerification = async (rawEmail: string) => {
    if (resendingRef.current || resendCooldown > 0) return;

    const email = normalizeEmail(rawEmail);
    const emailResult = validateEmail(email, {
      allowDisposable: false,
      checkTypos: false,
    });
    if (!emailResult.isValid) {
      setResendNotice({
        kind: "error",
        message: emailResult.error || "Enter a valid email address",
      });
      return;
    }

    resendingRef.current = true;
    setIsResending(true);
    setResendNotice(null);
    try {
      const data = await httpClient.post<ResendResponse>(
        "/api/auth/resend-verification/",
        { email },
        { skipAuth: true, skipCSRF: true, timeoutMs: AUTH_FETCH_TIMEOUT_MS }
      );
      setResendNotice(describeResendQueuedNotice(data, email));
      const wait = Number(data?.next_request_allowed_in);
      if (Number.isFinite(wait) && wait > 0) {
        setResendCooldown(Math.ceil(wait));
      }
    } catch (error: unknown) {
      const described = describeAuthError(error, "resend");
      if (
        (described.code === "cooldown" || described.code === "rate_limited") &&
        described.retryAfter
      ) {
        // The countdown under the button is the message
        setResendCooldown(described.retryAfter);
      } else {
        setResendNotice({ kind: "error", message: described.message });
      }
    } finally {
      resendingRef.current = false;
      setIsResending(false);
    }
  };

  const knownEmail = user?.email || resendEmail;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        {status === "loading" && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Verifying email…
            </h1>
            <p className="text-gray-600">Please wait a moment.</p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Email verified
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <p className="text-sm text-gray-500">
              Redirecting to sign in…
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {retryable ? "We couldn’t verify your email" : "Verification Failed"}
            </h1>
            <p role="alert" className="text-gray-600 mb-6">
              {message}
            </p>
            <div className="space-y-4">
              {retryable && (
                <button
                  type="button"
                  onClick={retryVerification}
                  disabled={waitSeconds > 0}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {waitSeconds > 0
                    ? `Try again in ${formatCountdown(waitSeconds)}`
                    : "Try again"}
                </button>
              )}
              <button
                type="button"
                onClick={() => redirectToAuth()}
                className={
                  retryable
                    ? "w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                    : "w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                }
              >
                Back to Login
              </button>
            </div>
          </div>
        )}

        {status === "expired" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Link expired or already used
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>

            <div className="space-y-4">
              {knownEmail ? (
                <button
                  type="button"
                  onClick={() => void resendVerification(knownEmail)}
                  disabled={isResending || resendCooldown > 0}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResending ? "Sending..." : "Resend Verification Email"}
                </button>
              ) : (
                <form
                  className="space-y-3 text-left"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    void resendVerification(typedEmail);
                  }}
                >
                  <label
                    htmlFor="resend-email"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Email address
                  </label>
                  <input
                    id="resend-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={typedEmail}
                    onChange={(e) => setTypedEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={isResending || resendCooldown > 0}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResending ? "Sending..." : "Send me a new link"}
                  </button>
                </form>
              )}

              {resendCooldown > 0 && (
                <p className="text-sm text-gray-500">
                  You can request another link in{" "}
                  {formatWaitTime(resendCooldown)}.
                </p>
              )}
              {resendNotice && (
                <p
                  role={resendNotice.kind === "error" ? "alert" : "status"}
                  className={
                    resendNotice.kind === "error"
                      ? "text-sm text-red-600"
                      : "text-sm text-green-700"
                  }
                >
                  {resendNotice.message}
                </p>
              )}

              <button
                type="button"
                onClick={() => redirectToAuth()}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading…</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
