"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { httpClient } from "@/utils/httpClient";
import { getAuthUrl, getSafeNextRedirect } from "@/utils/authHelpers";

interface VerificationResponse {
  message: string;
  user?: {
    id: number;
    name: string;
    email: string;
  };
}

type VerifyApiError = Error & {
  response?: {
    data?: {
      email?: string;
      can_resend?: boolean;
      error?: string;
      message?: string;
      user?: VerificationResponse["user"];
    };
  };
};

/**
 * One POST per token across Strict Mode remounts.
 * Remounts await the same in-flight (or settled) promise.
 */
const verifyPromises = new Map<string, Promise<VerificationResponse>>();

function postVerifyEmail(token: string): Promise<VerificationResponse> {
  let promise = verifyPromises.get(token);
  if (!promise) {
    promise = httpClient.post<VerificationResponse>(
      "/api/auth/verify-email/",
      { token },
      { skipAuth: true, skipCSRF: true }
    );
    verifyPromises.set(token, promise);
  }
  return promise;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const nextParam = searchParams.get("next");

  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "expired"
  >("loading");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null
  );
  const [resendEmail, setResendEmail] = useState("");
  const [isResending, setIsResending] = useState(false);

  // Prevents duplicate apply/redirect scheduling within a single mount
  const appliedResultRef = useRef(false);

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
    (responseMessage: string, verifiedUser?: VerificationResponse["user"]) => {
      setStatus("success");
      setMessage(responseMessage || "Email verified successfully");
      if (verifiedUser) {
        setUser(verifiedUser);
      }

      setTimeout(() => {
        redirectToAuth(verifiedUser?.email);
      }, 3000);
    },
    [redirectToAuth]
  );

  const applyVerifyError = useCallback(
    (error: unknown) => {
      console.error("Verification error:", error);
      const errorMessage =
        error instanceof Error ? error.message || "" : "";
      const apiData =
        error && typeof error === "object" && "response" in error
          ? (error as VerifyApiError).response?.data
          : undefined;

      const combinedMessage = (
        apiData?.message ||
        apiData?.error ||
        errorMessage ||
        ""
      ).toLowerCase();

      // Idempotent / already-verified responses (success-like UX)
      const alreadyVerified =
        combinedMessage.includes("already verified") ||
        (combinedMessage.includes("already been used") &&
          apiData?.can_resend === false);

      if (alreadyVerified) {
        const email = apiData?.email || apiData?.user?.email;
        if (email) {
          setUser({ name: apiData?.user?.name || "", email });
        }
        handleVerifiedSuccess(
          apiData?.message ||
            "Your email is already verified. You can sign in.",
          apiData?.user || (email ? { id: 0, name: "", email } : undefined)
        );
        return;
      }

      if (apiData?.email) {
        setResendEmail(apiData.email);
        setUser({ name: "", email: apiData.email });
      }

      if (
        errorMessage.includes("expired") ||
        errorMessage.includes("already been used") ||
        apiData?.can_resend
      ) {
        setStatus("expired");
        setMessage(
          "This verification link has expired or has already been used."
        );
      } else {
        setStatus("error");
        setMessage(errorMessage || "Failed to verify email address");
      }
    },
    [handleVerifiedSuccess]
  );

  // Keep latest handlers without re-firing verify when they change
  const handlersRef = useRef({
    handleVerifiedSuccess,
    applyVerifyError,
  });
  handlersRef.current = { handleVerifiedSuccess, applyVerifyError };

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided");
      return;
    }

    let cancelled = false;
    appliedResultRef.current = false;

    (async () => {
      try {
        const response = await postVerifyEmail(token);
        if (cancelled || appliedResultRef.current) return;
        appliedResultRef.current = true;
        handlersRef.current.handleVerifiedSuccess(
          response.message,
          response.user
        );
      } catch (error: unknown) {
        if (cancelled || appliedResultRef.current) return;
        appliedResultRef.current = true;
        handlersRef.current.applyVerifyError(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const resendVerification = async () => {
    const email = user?.email || resendEmail;
    if (!email) return;

    setIsResending(true);
    try {
      await httpClient.post(
        "/api/auth/resend-verification/",
        { email },
        { skipAuth: true, skipCSRF: true }
      );
      setMessage(
        "A new verification email has been sent to your email address."
      );
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to resend verification email"
      );
    } finally {
      setIsResending(false);
    }
  };

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
            <p className="text-sm text-gray-500">Redirecting to sign in…</p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Verification Failed
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              type="button"
              onClick={() => redirectToAuth()}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Login
            </button>
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
              Link Expired
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>

            <div className="space-y-4">
              {user?.email || resendEmail ? (
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={isResending}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isResending ? "Sending..." : "Resend Verification Email"}
                </button>
              ) : (
                <p className="text-sm text-gray-500">
                  Sign in and use “Resend verification email”, or request a new
                  link from the sign-in page.
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
