"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { httpClient } from "@/utils/httpClient";

interface VerificationResponse {
  message: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
}

// interface VerificationStatusResponse {
//   valid: boolean;
//   user: {
//     id: number;
//     name: string;
//     email: string;
//   };
//   is_verified: boolean;
// }

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "expired"
  >("loading");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null
  );
  const [isResending, setIsResending] = useState(false);

  const verifyEmail = useCallback(async () => {
    try {
      const response = await httpClient.post<VerificationResponse>(
        "/api/auth/verify-email/",
        {
          token,
        }
      );

      setStatus("success");
      setMessage(response.message);
      setUser(response.user);

      // Redirect to sign-in with email prefilled after 3 seconds
      setTimeout(() => {
        const encodedEmail = encodeURIComponent(response.user.email);
        router.push(`/auth?email=${encodedEmail}&verified=true`);
      }, 3000);
    } catch (error: unknown) {
      console.error("Verification error:", error);
      const errorMessage = (error as Error).message || "";

      if (
        errorMessage.includes("expired") ||
        errorMessage.includes("already been used")
      ) {
        setStatus("expired");
        setMessage(
          "This verification link has expired or has already been used."
        );
      } else {
        setStatus("error");
        setMessage(
          (error as Error).message || "Failed to verify email address"
        );
      }
    }
  }, [token, router]);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided");
      return;
    }

    verifyEmail();
  }, [token, verifyEmail]);

  const resendVerification = async () => {
    if (!user?.email) return;

    setIsResending(true);
    try {
      await httpClient.post("/api/auth/resend-verification/", {
        email: user.email,
      });
      setMessage(
        "A new verification email has been sent to your email address."
      );
    } catch (error: unknown) {
      setMessage(
        (error as Error).message || "Failed to resend verification email"
      );
    } finally {
      setIsResending(false);
    }
  };

  // const checkVerificationStatus = async () => {
  //   if (!token) return;

  //   try {
  //     const response = await httpClient.get<VerificationStatusResponse>(
  //       `/api/auth/check-verification/?token=${token}`
  //     );

  //     if (response.valid) {
  //       setUser(response.user);
  //       if (response.is_verified) {
  //         setStatus("success");
  //         setMessage("Your email has already been verified!");
  //         setTimeout(() => {
  //           router.push("/dashboard");
  //         }, 2000);
  //       }
  //     }
  //   } catch (error) {
  //     console.error("Status check error:", error);
  //   }
  // };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        {status === "loading" && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Verifying Your Email
            </h1>
            <p className="text-gray-600">
              Please wait while we verify your email address...
            </p>
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
              Email Verified!
            </h1>
            <p className="text-gray-600 mb-4">{message}</p>
            {user && (
              <p className="text-sm text-gray-500 mb-6">
                Welcome, {user.name}! You will be redirected to sign in with
                your email prefilled shortly.
              </p>
            )}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                🎉 Your account is now fully activated! You can start using all
                our features.
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Verification Failed
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => router.push("/auth")}
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

            {user && (
              <div className="space-y-4">
                <button
                  onClick={resendVerification}
                  disabled={isResending}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isResending ? "Sending..." : "Resend Verification Email"}
                </button>

                <button
                  onClick={() => router.push("/auth")}
                  className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Back to Login
                </button>
              </div>
            )}
          </div>
        )}

        {message && status !== "loading" && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
