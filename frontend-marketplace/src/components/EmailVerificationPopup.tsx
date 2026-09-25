"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/utils/httpClient";
import {
  describeAuthError,
  formatWaitTime,
  getAuthUrl,
  getSafeNextRedirect,
  describeResendQueuedNotice,
} from "@/utils/authHelpers";
import { AUTH_FETCH_TIMEOUT_MS } from "@/utils/fetchWithTimeout";
import { normalizeEmail } from "@/utils/emailValidation";

interface EmailVerificationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userName?: string;
  /** Optional return path; preserved on sign-in link when safe */
  next?: string | null;
  /**
   * False when the backend created the account but could not queue the
   * verification email (`email_queued: false`): the popup then says so and
   * puts the Resend button front and centre. Defaults to true.
   */
  emailQueued?: boolean;
}

interface ResendResponse {
  message?: string;
  already_verified?: boolean;
  email_queued?: boolean;
  next_request_allowed_in?: number;
}

const RESEND_NOTICE_MS = 6000;

const EmailVerificationPopup: React.FC<EmailVerificationPopupProps> = ({
  isOpen,
  onClose,
  userEmail,
  next,
  emailQueued = true,
}) => {
  const router = useRouter();
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState("");
  const [resendSuccess, setResendSuccess] = useState("");
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  // Flips once a resend went through, so "we couldn't send it" stops showing.
  const [resentOk, setResentOk] = useState(false);
  // Synchronous in-flight guard: state updates land too late for double clicks.
  const resendingRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  // Countdown timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (cooldownRemaining > 0) {
      interval = setInterval(() => {
        setCooldownRemaining((prev) => {
          const newValue = prev <= 1 ? 0 : prev - 1;
          return newValue;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [cooldownRemaining]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSignInClick = () => {
    const safeNext =
      getSafeNextRedirect(next ?? null) ||
      (typeof window !== "undefined"
        ? getSafeNextRedirect(
            new URLSearchParams(window.location.search).get("next")
          )
        : null);
    const authUrl = getAuthUrl({ mode: "signin", next: safeNext });
    const url = new URL(authUrl, window.location.origin);
    url.searchParams.set("email", userEmail);
    router.push(`${url.pathname}${url.search}`);
    onClose();
  };

  const handleResendVerification = async () => {
    if (resendingRef.current || cooldownRemaining > 0) return;
    resendingRef.current = true;

    setIsResending(true);
    setResendError("");
    setResendSuccess("");
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);

    try {
      const email = normalizeEmail(userEmail);
      const data = await httpClient.post<ResendResponse>(
        "/api/auth/resend-verification/",
        { email },
        { skipAuth: true, skipCSRF: true, timeoutMs: AUTH_FETCH_TIMEOUT_MS }
      );

      const notice = describeResendQueuedNotice(data, email);
      if (notice.kind === "error") {
        setResendError(notice.message);
      } else {
        setResentOk(true);
        setResendSuccess(notice.message);
        noticeTimerRef.current = setTimeout(
          () => setResendSuccess(""),
          RESEND_NOTICE_MS
        );
      }
      const wait = Number(data?.next_request_allowed_in);
      if (Number.isFinite(wait) && wait > 0) {
        setCooldownRemaining(Math.ceil(wait));
      }
    } catch (error: unknown) {
      console.error("Resend verification error:", error);
      const described = describeAuthError(error, "resend");
      if (
        (described.code === "cooldown" || described.code === "rate_limited") &&
        described.retryAfter
      ) {
        // The live countdown below is the message; no stale text afterwards.
        setCooldownRemaining(described.retryAfter);
      } else {
        setResendError(described.message);
      }
    } finally {
      resendingRef.current = false;
      setIsResending(false);
    }
  };

  const showNotQueued = !emailQueued && !resentOk;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-all duration-300"
      style={{
        background: "rgba(0, 0, 0, 0.15)",
        backdropFilter: "blur(2px)",
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="max-w-md w-full mx-4 relative animate-fade-in-up"
        style={{
          background: "var(--card-bg)",
          borderRadius: "1.5rem",
          boxShadow: "var(--card-shadow)",
          padding: "2rem",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        {/* Content */}
        <div className="text-center">
          {/* Email icon */}
          <div className="mb-6 flex justify-center">
            <div
              className="p-4 rounded-full"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
          </div>

          <h2
            className="text-2xl font-bold mb-3"
            style={{ color: "var(--foreground)" }}
          >
            {showNotQueued ? "Account Created" : "Check Your Email"}
          </h2>

          <p
            className="mb-6 leading-relaxed"
            style={{
              color: "var(--foreground)",
              opacity: 0.8,
            }}
          >
            {showNotQueued ? (
              <>
                Your account has been created, but we couldn&apos;t send the
                verification email to{" "}
                <span
                  className="font-semibold"
                  style={{ color: "var(--primary)" }}
                >
                  {userEmail}
                </span>{" "}
                automatically. Use the button below to send it now.
              </>
            ) : (
              <>
                We&apos;ve sent a verification link to{" "}
                <span
                  className="font-semibold"
                  style={{ color: "var(--primary)" }}
                >
                  {userEmail}
                </span>
                . Please check your inbox and click the link to activate your
                account.
              </>
            )}
          </p>

          {showNotQueued ? (
            /* Nothing was sent: make Resend the primary action */
            <div
              className="mb-6 p-4 rounded-lg border"
              style={{
                background: "rgba(251, 191, 36, 0.1)",
                borderColor: "rgba(251, 191, 36, 0.3)",
              }}
            >
              <p
                className="text-sm font-medium mb-3"
                style={{ color: "var(--foreground)" }}
              >
                Your verification email has not been sent yet.
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isResending || cooldownRemaining > 0}
                className="w-full py-3 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--btn-primary)",
                  color: "var(--btn-primary-fg)",
                  border: "1px solid var(--btn-primary)",
                  boxShadow: "0 0 0 3px rgba(251, 191, 36, 0.35)",
                }}
              >
                {isResending ? "Sending..." : "Resend verification email"}
              </button>
            </div>
          ) : (
            /* Info box */
            <div
              className="mb-6 p-4 rounded-lg border"
              style={{
                background: "var(--sidebar-bg)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <div className="flex items-start space-x-3">
                <svg
                  className="w-5 h-5 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--accent)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    Didn&apos;t receive the email?
                  </p>
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Check your spam folder or{" "}
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={isResending || cooldownRemaining > 0}
                      className="underline hover:no-underline transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ color: "var(--primary)" }}
                    >
                      {isResending ? "sending..." : "resend verification email"}
                    </button>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Resend Error Message - only show when there's an error but no countdown */}
          {resendError && cooldownRemaining === 0 && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-lg border text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                borderColor: "rgba(239, 68, 68, 0.3)",
                color: "var(--destructive)",
              }}
            >
              {resendError}
            </div>
          )}

          {/* Always show countdown when active */}
          {cooldownRemaining > 0 && (
            <div
              className="mb-4 p-3 rounded-lg border text-sm text-center"
              style={{
                background: "rgba(255, 193, 7, 0.1)",
                borderColor: "rgba(255, 193, 7, 0.3)",
                color: "var(--accent)",
              }}
            >
              <div className="flex items-center justify-center space-x-2">
                <svg
                  className="w-4 h-4 animate-spin"
                  style={{ color: "var(--accent)" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="font-medium">
                  Resend available in {formatWaitTime(cooldownRemaining)}
                </span>
              </div>
            </div>
          )}

          {resendSuccess && (
            <div
              role="status"
              className="mb-4 p-3 rounded-lg border text-sm"
              style={{
                background: "var(--success-bg)",
                borderColor: "var(--success-border)",
                color: "var(--success-text)",
              }}
            >
              {resendSuccess}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSignInClick}
              className="w-full py-3 px-4 rounded-lg font-semibold transition-colors"
              style={{
                backgroundColor: "var(--btn-primary)",
                color: "var(--btn-primary-fg)",
                border: "1px solid var(--btn-primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--btn-primary-hover)";
                e.currentTarget.style.borderColor = "var(--btn-primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--btn-primary)";
                e.currentTarget.style.borderColor = "var(--btn-primary)";
              }}
            >
              Go to Sign In
            </button>

            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-lg font-medium transition-colors"
              style={{
                backgroundColor: "transparent",
                color: "var(--foreground)",
                border: "1px solid var(--sidebar-border)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--sidebar-bg)";
                e.currentTarget.style.borderColor = "var(--btn-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "var(--sidebar-border)";
              }}
            >
              Continue Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationPopup;
