"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/utils/httpClient";

interface EmailVerificationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userName?: string;
}

const EmailVerificationPopup: React.FC<EmailVerificationPopupProps> = ({
  isOpen,
  onClose,
  userEmail,
}) => {
  const router = useRouter();
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState("");
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

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

  // Clear error when countdown reaches 0
  useEffect(() => {
    if (
      cooldownRemaining === 0 &&
      resendError &&
      resendError.includes("Please wait")
    ) {
      setResendError("");
    }
  }, [cooldownRemaining, resendError]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSignInClick = () => {
    const encodedEmail = encodeURIComponent(userEmail);
    router.push(`/auth?email=${encodedEmail}&mode=signin`);
    onClose();
  };

  const handleResendVerification = async () => {
    if (isResending || cooldownRemaining > 0) return;

    setIsResending(true);
    setResendError("");
    setResendSuccess(false);

    try {
      await httpClient.post("/api/auth/resend-verification/", {
        email: userEmail,
      });

      setResendSuccess(true);
      // Clear success message after 3 seconds
      setTimeout(() => setResendSuccess(false), 3000);
    } catch (error: unknown) {
      console.error("Resend verification error:", error);

      // Check if it's a cooldown error
      if (error && typeof error === "object" && "response" in error) {
        const response = (
          error as {
            response: {
              data?: {
                cooldown_remaining?: number;
                error?: string;
              };
              status?: number;
            };
          }
        ).response;

        if (response?.data?.cooldown_remaining) {
          setCooldownRemaining(response.data.cooldown_remaining);
          // Don't set error message for cooldown - let countdown display handle it
        } else if (response?.data?.error) {
          setResendError(response.data.error);
        } else {
          setResendError("Failed to resend verification email");
        }
      } else {
        const errorMessage =
          (error as Error).message || "Failed to resend verification email";
        setResendError(errorMessage);
      }
    } finally {
      setIsResending(false);
    }
  };

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
            Check Your Email
          </h2>

          <p
            className="mb-6 leading-relaxed"
            style={{
              color: "var(--foreground)",
              opacity: 0.8,
            }}
          >
            We&apos;ve sent a verification link to{" "}
            <span className="font-semibold" style={{ color: "var(--primary)" }}>
              {userEmail}
            </span>
            . Please check your inbox and click the link to activate your
            account.
          </p>

          {/* Info box */}
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

          {/* Resend Error Message - only show when there's an error but no countdown */}
          {resendError && cooldownRemaining === 0 && (
            <div
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
                  Resend available in {cooldownRemaining} seconds
                </span>
              </div>
            </div>
          )}

          {resendSuccess && (
            <div
              className="mb-4 p-3 rounded-lg border text-sm"
              style={{
                background: "var(--success-bg)",
                borderColor: "var(--success-border)",
                color: "var(--success-text)",
              }}
            >
              Verification email sent successfully! Please check your inbox.
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSignInClick}
              className="w-full py-3 px-4 rounded-lg font-semibold transition-colors"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--card-bg)",
                border: "1px solid var(--primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--primary-hover)";
                e.currentTarget.style.borderColor = "var(--primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--primary)";
                e.currentTarget.style.borderColor = "var(--primary)";
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
                e.currentTarget.style.borderColor = "var(--primary)";
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
