"use client";
import React, { useState, useEffect, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { httpClient } from "@/utils/httpClient";

interface User {
  name: string;
  email: string;
}

interface TokenValidationResponse {
  valid: boolean;
  user: User;
}

function ResetPasswordForm() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Helper function to format error messages
  const formatErrorMessage = (error: string): string => {
    // Capitalize first letter and ensure proper punctuation
    let formatted = error.trim();
    if (
      formatted &&
      !formatted.endsWith(".") &&
      !formatted.endsWith("!") &&
      !formatted.endsWith("?")
    ) {
      formatted += ".";
    }
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  const validateToken = useCallback(async (tokenToValidate: string) => {
    try {
      setValidating(true);
      setError("");

      // Validate token with backend
      const response = await httpClient.get(
        `/api/auth/password-reset/validate/?token=${tokenToValidate}`,
        { skipAuth: true }
      );

      if (
        response &&
        (response as TokenValidationResponse).valid &&
        (response as TokenValidationResponse).user
      ) {
        setUser((response as TokenValidationResponse).user);
        console.log(
          "Token validated successfully for user:",
          (response as TokenValidationResponse).user.email
        );
      } else {
        setError(
          formatErrorMessage(
            "Invalid or expired reset token. Please request a new password reset"
          )
        );
      }
    } catch (err: unknown) {
      console.error("Token validation failed:", err);

      // Enhanced error handling for token validation
      let errorMessage =
        "Invalid or expired reset token. Please request a new password reset.";

      if (err && typeof err === "object" && "response" in err) {
        const response = (
          err as {
            response: { data?: { error?: string | string[] }; status?: number };
          }
        ).response;

        if (response && response.data && response.data.error) {
          const backendError = response.data.error;
          if (typeof backendError === "string") {
            errorMessage = backendError;
          } else if (Array.isArray(backendError)) {
            errorMessage = backendError.join(", ");
          }
        }

        // Handle specific HTTP status codes
        if (response.status === 400) {
          errorMessage =
            "Invalid reset token. Please request a new password reset.";
        } else if (response.status === 404) {
          errorMessage =
            "Reset token not found. Please request a new password reset.";
        } else if (response.status && response.status >= 500) {
          errorMessage = "Server error. Please try again later.";
        }
      } else if (err && typeof err === "object" && "message" in err) {
        const networkError = (err as { message: string }).message;
        if (
          networkError.includes("Network Error") ||
          networkError.includes("fetch")
        ) {
          errorMessage =
            "Network error. Please check your connection and try again.";
        }
      }

      setError(formatErrorMessage(errorMessage));
    } finally {
      setValidating(false);
    }
  }, []);

  useEffect(() => {
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      setToken(tokenParam);
      validateToken(tokenParam);
    } else {
      setError(
        formatErrorMessage(
          "Invalid reset link. Please request a new password reset"
        )
      );
      setValidating(false);
    }
  }, [searchParams, validateToken]);

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(
      password
    );

    if (!hasLetter) {
      return "Password must contain at least one letter";
    }

    if (!hasNumber) {
      return "Password must contain at least one number";
    }

    if (!hasSpecialChar) {
      return "Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;':\",./<>?)";
    }

    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validate passwords match
    if (formData.newPassword !== formData.confirmPassword) {
      setError(formatErrorMessage("Passwords do not match"));
      setLoading(false);
      return;
    }

    // Validate password strength
    const passwordError = validatePassword(formData.newPassword);
    if (passwordError) {
      setError(formatErrorMessage(passwordError));
      setLoading(false);
      return;
    }

    try {
      await httpClient.post(
        "/api/auth/password-reset/confirm/",
        {
          token: token,
          new_password: formData.newPassword,
        },
        { skipAuth: true }
      );

      setSuccess(true);
      setTimeout(() => {
        router.push("/auth");
      }, 3000);
    } catch (err: unknown) {
      console.error("Password reset failed:", err);

      // Enhanced error handling to show specific error messages
      let errorMessage = "Failed to reset password. Please try again.";

      if (err && typeof err === "object" && "response" in err) {
        const response = (
          err as {
            response: {
              data?: {
                error?: string | string[];
                message?: string;
                detail?: string;
                non_field_errors?: string | string[];
                new_password?: string | string[];
                token?: string | string[];
              };
              status?: number;
            };
          }
        ).response;

        if (response && response.data) {
          const data = response.data;

          // Handle different error response formats
          if (typeof data === "object") {
            if (data.error) {
              // Handle single error message
              if (Array.isArray(data.error)) {
                errorMessage = data.error.join(", ");
              } else {
                errorMessage = data.error;
              }
            } else if (data.message) {
              errorMessage = data.message;
            } else if (data.detail) {
              errorMessage = data.detail;
            } else if (data.non_field_errors) {
              // Handle Django form errors
              if (Array.isArray(data.non_field_errors)) {
                errorMessage = data.non_field_errors.join(", ");
              } else {
                errorMessage = data.non_field_errors;
              }
            } else if (data.new_password) {
              // Handle password validation errors
              if (Array.isArray(data.new_password)) {
                errorMessage = data.new_password.join(", ");
              } else {
                errorMessage = data.new_password;
              }
            } else if (data.token) {
              // Handle token validation errors
              if (Array.isArray(data.token)) {
                errorMessage = data.token.join(", ");
              } else {
                errorMessage = data.token;
              }
            }
          }
        }

        // Handle HTTP status codes
        if (response.status === 400) {
          // Bad request - validation errors
          if (
            !errorMessage.includes("Invalid") &&
            !errorMessage.includes("expired")
          ) {
            errorMessage =
              "Please check your input and try again. " + errorMessage;
          }
        } else if (response.status === 401) {
          errorMessage =
            "Authentication failed. Please request a new password reset link.";
        } else if (response.status === 403) {
          errorMessage =
            "Access denied. Please request a new password reset link.";
        } else if (response.status === 404) {
          errorMessage =
            "Password reset service not found. Please try again later.";
        } else if (response.status === 429) {
          errorMessage =
            "Too many attempts. Please wait a few minutes before trying again.";
        } else if (response.status && response.status >= 500) {
          errorMessage =
            "Server error. Please try again later or contact support.";
        }
      } else if (err && typeof err === "object" && "message" in err) {
        // Handle network errors
        const networkError = (err as { message: string }).message;
        if (
          networkError.includes("Network Error") ||
          networkError.includes("fetch")
        ) {
          errorMessage =
            "Network error. Please check your connection and try again.";
        } else {
          errorMessage = networkError;
        }
      }

      setError(formatErrorMessage(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 auth-container">
        <div className="max-w-md w-full space-y-8 auth-form">
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"
              style={{ borderColor: "var(--primary)" }}
            ></div>
            <p className="mt-4" style={{ color: "var(--muted-foreground)" }}>
              Validating reset token...
            </p>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Please wait while we verify your reset link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 auth-container">
        <div className="max-w-md w-full space-y-8 auth-form">
          <div className="text-center">
            <div
              className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-6"
              style={{
                backgroundColor: "var(--success-bg)",
                border: "2px solid var(--success-border)",
              }}
            >
              <svg
                className="w-8 h-8"
                style={{ color: "var(--success-text)" }}
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
            <h2
              className="text-3xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Password Reset Successful!
            </h2>
            <p className="mb-6" style={{ color: "var(--muted-foreground)" }}>
              {user?.name
                ? `Hi ${user.name}, your password has been successfully reset.`
                : "Your password has been successfully reset."}{" "}
              You will be redirected to the login page shortly.
            </p>
            <button
              onClick={() => router.push("/auth")}
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
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 auth-container">
        <div className="max-w-md w-full space-y-8 auth-form">
          <div className="text-center">
            <div
              className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-6"
              style={{
                backgroundColor: "rgba(220, 38, 38, 0.1)",
                border: "2px solid rgba(220, 38, 38, 0.3)",
              }}
            >
              <svg
                className="w-8 h-8"
                style={{ color: "var(--destructive)" }}
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
            <h2
              className="text-3xl font-bold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Invalid Reset Link
            </h2>
            <p className="mb-4" style={{ color: "var(--muted-foreground)" }}>
              {error}
            </p>
            <p
              className="mb-6 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              If you need a new password reset link, please request one from the
              login page.
            </p>
            <button
              onClick={() => router.push("/auth?forgotPassword=true")}
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
              Request New Reset Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 auth-container">
      <div className="max-w-md w-full space-y-8 auth-form">
        <div>
          {/* Profile Image */}
          <div className="flex justify-center mb-6">
            <Image
              src="/profile-user.png"
              alt="User Profile"
              width={80}
              height={80}
              className="rounded-full object-cover"
            />
          </div>
          <h2
            className="mt-6 text-center text-3xl font-extrabold"
            style={{ color: "var(--foreground)" }}
          >
            {user?.name ? `Welcome back, ${user.name}!` : "Reset Your Password"}
          </h2>
          <p
            className="mt-2 text-center text-sm"
            style={{ color: "var(--foreground)" }}
          >
            {user?.name ? `Hello ${user.name},` : "Hello,"} please enter your
            new password below.
          </p>
          {user?.email && (
            <p
              className="mt-1 text-center text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Account: {user.email}
            </p>
          )}
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                New Password
              </label>
              <div className="flex items-end gap-2">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                  placeholder="Enter your new password (min 8 characters, letters and numbers)"
                  value={formData.newPassword}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity border-0 bg-transparent"
                  style={{
                    color: "var(--foreground)",
                    background: "none",
                    paddingLeft: "8px",
                    paddingRight: "8px",
                    paddingTop: "4px",
                    paddingBottom: "4px",
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Confirm New Password
              </label>
              <div className="flex items-end gap-2">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                  placeholder="Confirm your new password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity border-0 bg-transparent"
                  style={{
                    color: "var(--foreground)",
                    background: "none",
                    paddingLeft: "8px",
                    paddingRight: "8px",
                    paddingTop: "4px",
                    paddingBottom: "4px",
                  }}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div
              className="text-sm text-center"
              style={{
                color: "var(--foreground)",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                marginTop: "0.5rem",
              }}
            >
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--card-bg)",
                border: "1px solid var(--primary)",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor =
                    "var(--primary-hover)";
                  e.currentTarget.style.borderColor = "var(--primary-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "var(--primary)";
                  e.currentTarget.style.borderColor = "var(--primary)";
                }
              }}
            >
              {loading ? "Resetting Password..." : "Reset Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
