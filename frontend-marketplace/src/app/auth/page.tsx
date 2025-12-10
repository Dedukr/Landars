"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { httpClient } from "@/utils/httpClient";
import { EmailInput } from "@/components/ui/EmailInput";
import EmailVerificationPopup from "@/components/EmailVerificationPopup";

interface AuthResponse {
  access?: string;
  refresh?: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
  email_verification_required?: boolean;
  message?: string;
}

function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [forgotPasswordCooldown, setForgotPasswordCooldown] = useState(0);
  const [forgotPasswordWarning, setForgotPasswordWarning] = useState("");
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [showCreateAccountSuggestion, setShowCreateAccountSuggestion] =
    useState(false);
  const [showEmailVerificationPopup, setShowEmailVerificationPopup] =
    useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    const mode = searchParams.get("mode");
    const email = searchParams.get("email");
    const verified = searchParams.get("verified");

    if (mode === "signup") {
      setIsSignUp(true);
    } else if (mode === "signin") {
      setIsSignUp(false);
    }

    // Handle email prefilling from verification
    if (email) {
      setFormData((prev) => ({ ...prev, email: decodeURIComponent(email) }));

      // Show success message if coming from verification
      if (verified === "true") {
        setSuccessMessage("Email verified successfully! You can now sign in.");
      }
    }
  }, [searchParams]);

  // Handle forgotPassword query parameter to auto-open forgot password modal
  useEffect(() => {
    const forgotPassword = searchParams.get("forgotPassword");
    if (forgotPassword === "true") {
      setShowForgotPassword(true);
      // Clean up the URL by removing the query parameter
      const url = new URL(window.location.href);
      url.searchParams.delete("forgotPassword");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  // Countdown timer effect for forgot password cooldown
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (forgotPasswordCooldown > 0) {
      interval = setInterval(() => {
        setForgotPasswordCooldown((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [forgotPasswordCooldown]);

  // Resend cooldown timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (resendCooldown > 0) {
      interval = setInterval(() => {
        setResendCooldown((prev) => {
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
  }, [resendCooldown]);

  // Clear error when countdown reaches 0 (for any remaining cooldown-related errors)
  useEffect(() => {
    if (resendCooldown === 0 && error && error.includes("Please wait")) {
      setError("");
    }
  }, [resendCooldown, error]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (!hasLetter || !hasNumber) {
      return "Password must contain at least one letter and one number";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (isSignUp) {
      // Validate passwords match
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }

      // Validate password strength
      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }

      try {
        const data = await httpClient.post<AuthResponse>(
          "/api/auth/register/",
          {
            name: formData.name,
            email: formData.email,
            password: formData.password,
          }
        );

        // Check if email verification is required
        if (data.email_verification_required) {
          setError(""); // Clear any previous errors
          setVerificationEmail(formData.email);
          setShowEmailVerificationPopup(true);
          setLoading(false); // Re-enable the button
          // Don't log in yet - wait for email verification
          return;
        }

        // Handle JWT tokens for immediate login (if verification not required)
        if (data.access && data.refresh) {
          login({ access: data.access, refresh: data.refresh }, data.user);
          router.push("/");
        }
      } catch (error: unknown) {
        // Display error message from server
        const errorMessage =
          error instanceof Error
            ? Array.isArray(error.message)
              ? error.message.join(", ")
              : error.message
            : "Registration failed";

        setError(errorMessage);
        // Registration error occurred
      }
    } else {
      // Sign in logic
      try {
        const data = await httpClient.post<AuthResponse>(
          "/api/auth/login/",
          {
            email: formData.email,
            password: formData.password,
          },
          { skipAuth: true }
        );

        // Check if email verification is required
        if (data.email_verification_required) {
          setError(""); // Clear any previous errors
          setSuccessMessage(
            `Please verify your email address (${formData.email}) before logging in. Check your email for a verification link.`
          );
          setLoading(false); // Re-enable the button
          return;
        }

        // Handle JWT tokens for successful login
        if (data.access && data.refresh) {
          login({ access: data.access, refresh: data.refresh }, data.user);
          router.push("/");
        }
      } catch (error: unknown) {
        // Enhanced error handling for login
        let errorMessage = "Login failed";
        let showCreateAccountSuggestion = false;

        if (error && typeof error === "object" && "response" in error) {
          const response = (
            error as {
              response: {
                data?: {
                  error?: string;
                  detail?: string;
                  non_field_errors?: string | string[];
                  suggestion?: string;
                };
                status?: number;
              };
            }
          ).response;

          if (response && response.data) {
            const data = response.data;

            // Handle different error response formats
            if (data.error) {
              errorMessage = data.error;
            } else if (data.detail) {
              errorMessage = data.detail;
            } else if (data.non_field_errors) {
              if (Array.isArray(data.non_field_errors)) {
                errorMessage = data.non_field_errors.join(", ");
              } else {
                errorMessage = data.non_field_errors;
              }
            }

            // Check if backend suggests creating an account
            if (data.suggestion === "create_account") {
              showCreateAccountSuggestion = true;
            }
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        setError(errorMessage);

        // Show create account suggestion if appropriate
        if (
          showCreateAccountSuggestion ||
          errorMessage.includes("Would you like to create an account")
        ) {
          setShowCreateAccountSuggestion(true);
        }
      }
    }

    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (forgotPasswordCooldown > 0 || forgotPasswordLoading) return;

    try {
      setForgotPasswordLoading(true);
      setForgotPasswordError("");
      setForgotPasswordWarning("");
      setShowCreateAccountSuggestion(false);

      if (!forgotPasswordEmail.trim()) {
        setForgotPasswordError("Email is required");
        return;
      }

      const response = await httpClient.post<{
        message?: string;
        warning?: string;
        error?: string;
        cooldown_total?: number;
        cooldown_remaining?: number;
        next_request_allowed_in?: number;
        suggestion?: string;
      }>(
        "/api/auth/password-reset/",
        {
          email: forgotPasswordEmail.trim(),
        },
        { skipAuth: true }
      );

      if (response.message) {
        setForgotPasswordSuccess(true);

        // Set cooldown if provided
        if (response.cooldown_total) {
          setForgotPasswordCooldown(response.next_request_allowed_in || 60);
        }

        setForgotPasswordEmail("");
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotPasswordSuccess(false);
        }, 3000);
      } else if (response.error) {
        setForgotPasswordError(response.error);
        if (response.suggestion === "create_account") {
          setShowCreateAccountSuggestion(true);
        }
        // Handle cooldown from successful response
        if (response.cooldown_remaining) {
          setForgotPasswordCooldown(response.cooldown_remaining);
        }
      } else if (response.warning) {
        setForgotPasswordWarning(response.warning);
        if (response.suggestion === "create_account") {
          setShowCreateAccountSuggestion(true);
        }
      }
    } catch (err: unknown) {
      console.error("Failed to request password reset:", err);

      let errorMessage = "Failed to send password reset email";

      if (err && typeof err === "object" && "response" in err) {
        const response = (
          err as {
            response: {
              data?: {
                error?: string;
                warning?: string;
                cooldown_remaining?: number;
                suggestion?: string;
              };
              status?: number;
            };
          }
        ).response;

        if (response && response.data) {
          const data = response.data;

          if (data.cooldown_remaining) {
            setForgotPasswordCooldown(data.cooldown_remaining);
            errorMessage =
              data.error ||
              `Please wait ${data.cooldown_remaining} seconds before requesting another reset link.`;
          } else if (data.warning) {
            setForgotPasswordWarning(data.warning);
            if (data.suggestion === "create_account") {
              setShowCreateAccountSuggestion(true);
            }
            return; // Don't set error for warnings
          } else if (data.error) {
            errorMessage = data.error;
            // Show create account suggestion if the error suggests it
            if (data.suggestion === "create_account") {
              setShowCreateAccountSuggestion(true);
            }
            // Handle cooldown from error response
            if (data.cooldown_remaining) {
              setForgotPasswordCooldown(data.cooldown_remaining);
            }
          }
        }
      }

      setForgotPasswordError(errorMessage);
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const toggleMode = () => {
    const newMode = !isSignUp;
    setIsSignUp(newMode);
    // Preserve email when switching from sign-in to sign-up
    const preservedEmail = newMode ? formData.email : "";
    setFormData({
      name: "",
      email: preservedEmail,
      password: "",
      confirmPassword: "",
    });
    setError("");
    setSuccessMessage("");
    // Update URL to reflect the new mode
    const newUrl = newMode ? "/auth?mode=signup" : "/auth?mode=signin";
    router.replace(newUrl);
  };

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
            {isSignUp ? "Create your account" : "Sign in to your account"}
          </h2>
          <p
            className="mt-2 text-center text-sm"
            style={{ color: "var(--foreground)" }}
          >
            {isSignUp ? "Already have an account? " : "Don't have an account? "}
            <button
              onClick={toggleMode}
              className="px-3 py-1 text-sm font-medium rounded-md transition-colors cursor-pointer hover:opacity-80"
              style={{
                color: "var(--primary)",
                border: "1px solid var(--primary)",
                background: "transparent",
              }}
            >
              {isSignUp ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {isSignUp && (
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Full Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required={isSignUp}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                  placeholder="Your full name"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>
            )}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--foreground)" }}
              >
                Email Address
              </label>
              {isSignUp ? (
                <EmailInput
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={(email) => {
                    setFormData((prev) => ({ ...prev, email }));
                    // You can also track validation state if needed
                  }}
                  placeholder="Email address"
                  required
                  showSuggestions={false}
                  validationOptions={{
                    allowDisposable: false,
                    checkTypos: true,
                    validateOnChange: true,
                    validateOnBlur: true,
                  }}
                  className="auth-input"
                />
              ) : (
                <input
                  id="email"
                  name="email"
                  type="text"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Email address"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                />
              )}
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Password
              </label>
              <div className="flex items-end gap-2">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                  placeholder={
                    isSignUp
                      ? "Password (min 8 characters, letters and numbers)"
                      : "Password"
                  }
                  value={formData.password}
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
            {isSignUp && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  Confirm Password
                </label>
                <div className="flex items-end gap-2">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required={isSignUp}
                    className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                    placeholder="Confirm password"
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
            )}
          </div>

          {/* Forgot Password Link - Only show on sign-in */}
          {!isSignUp && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setForgotPasswordEmail(formData.email); // Pre-fill with current email
                  setShowForgotPassword(true);
                }}
                className="text-sm font-medium hover:opacity-80 transition-opacity"
                style={{ color: "var(--primary)" }}
              >
                Forgot your password?
              </button>
            </div>
          )}

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
              {error.includes("create an account") ? (
                <div>
                  No account found with this email address. Would you like to{" "}
                  <button
                    onClick={() => {
                      setIsSignUp(true);
                      setError("");
                      setShowCreateAccountSuggestion(false);
                    }}
                    className="text-sm font-medium underline transition-all duration-200 hover:opacity-80 hover:scale-105 hover:shadow-sm cursor-pointer"
                    style={{
                      color: "var(--primary)",
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--primary-hover)";
                      e.currentTarget.style.textDecorationThickness = "2px";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--primary)";
                      e.currentTarget.style.textDecorationThickness = "1px";
                    }}
                  >
                    create an account
                  </button>
                  ?
                </div>
              ) : (
                error
              )}
            </div>
          )}

          {successMessage && (
            <div
              className="text-sm text-center"
              style={{
                color: "var(--foreground)",
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                marginTop: "0.5rem",
              }}
            >
              {successMessage}
              {successMessage.includes("verify your email") && (
                <div className="mt-2">
                  <button
                    onClick={async () => {
                      if (resendCooldown > 0) return;

                      try {
                        await httpClient.post(
                          "/api/auth/resend-verification/",
                          {
                            email: formData.email,
                          }
                        );
                        setSuccessMessage(
                          "Verification email sent! Please check your inbox."
                        );
                      } catch (error: unknown) {
                        // Check if it's a cooldown error
                        if (
                          error &&
                          typeof error === "object" &&
                          "response" in error
                        ) {
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
                            setResendCooldown(response.data.cooldown_remaining);
                            // Don't set error message for cooldown - let countdown display handle it
                          } else if (response?.data?.error) {
                            setError(response.data.error);
                          } else {
                            setError(
                              "Failed to resend verification email. Please try again."
                            );
                          }
                        } else {
                          setError(
                            "Failed to resend verification email. Please try again."
                          );
                        }
                      }
                    }}
                    disabled={resendCooldown > 0}
                    className="text-blue-600 hover:text-blue-700 underline text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Resend verification email
                  </button>

                  {/* Countdown display */}
                  {resendCooldown > 0 && (
                    <div
                      className="mt-2 text-xs text-center"
                      style={{ color: "var(--accent)" }}
                    >
                      <div className="flex items-center justify-center space-x-1">
                        <svg
                          className="w-3 h-3 animate-spin"
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
                        <span>
                          Resend available in {resendCooldown} seconds
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
              {loading
                ? isSignUp
                  ? "Creating account..."
                  : "Signing in..."
                : isSignUp
                ? "Create account"
                : "Sign in"}
            </button>
          </div>
        </form>

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{
              background: "rgba(0, 0, 0, 0.4)",
              backdropFilter: "blur(4px)",
              paddingTop: "80px", // Ensure it doesn't cover header
              paddingBottom: "20px",
            }}
          >
            <div
              className="w-full max-w-md mx-4 rounded-xl shadow-lg border"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              {/* Modal Header */}
              <div
                className="flex justify-between items-center p-6 border-b"
                style={{ borderColor: "var(--sidebar-border)" }}
              >
                <h3
                  className="text-xl font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Reset Your Password
                </h3>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotPasswordEmail("");
                    setForgotPasswordError("");
                    setForgotPasswordSuccess(false);
                    setForgotPasswordWarning("");
                    setShowCreateAccountSuggestion(false);
                  }}
                  className="p-2 rounded-lg hover:opacity-70 transition-opacity"
                  style={{
                    color: "var(--muted-foreground)",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <svg
                    className="w-5 h-5"
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
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {forgotPasswordSuccess ? (
                  <div className="text-center">
                    <div className="mb-6">
                      <div
                        className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
                        style={{ background: "var(--success-bg)" }}
                      >
                        <svg
                          className="w-8 h-8"
                          style={{ color: "var(--success)" }}
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
                    </div>
                    <h4
                      className="text-lg font-semibold mb-3"
                      style={{ color: "var(--foreground)" }}
                    >
                      Check Your Email
                    </h4>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      If the email exists, a password reset link has been sent
                      to your email address.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p
                      className="text-sm mb-6 leading-relaxed"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Enter your email address and we&apos;ll send you a link to
                      reset your password.
                    </p>

                    <div className="space-y-6">
                      <div>
                        <label
                          htmlFor="forgot-email"
                          className="block text-sm font-medium mb-2"
                          style={{ color: "var(--foreground)" }}
                        >
                          Email Address
                        </label>
                        <input
                          id="forgot-email"
                          type="email"
                          value={forgotPasswordEmail}
                          onChange={(e) =>
                            setForgotPasswordEmail(e.target.value)
                          }
                          placeholder="Enter your email address"
                          required
                          className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 transition-colors"
                          style={{
                            backgroundColor: "var(--background)",
                            borderColor: "var(--border)",
                            color: "var(--foreground)",
                          }}
                        />
                      </div>

                      {/* Error Message */}
                      {forgotPasswordError && (
                        <div
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            borderColor: "rgba(239, 68, 68, 0.3)",
                          }}
                        >
                          <div className="flex items-start">
                            <div className="flex-shrink-0">
                              <svg
                                className="w-5 h-5"
                                style={{ color: "var(--destructive)" }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </div>
                            <div className="ml-3">
                              <p
                                className="text-sm font-medium"
                                style={{ color: "var(--destructive)" }}
                              >
                                {forgotPasswordError}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Warning Message */}
                      {forgotPasswordWarning && (
                        <div
                          className="p-4 rounded-lg border"
                          style={{
                            backgroundColor: "rgba(251, 191, 36, 0.1)",
                            borderColor: "rgba(251, 191, 36, 0.3)",
                          }}
                        >
                          <div className="flex items-start">
                            <div className="flex-shrink-0">
                              <svg
                                className="w-5 h-5"
                                style={{ color: "var(--warning)" }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                                />
                              </svg>
                            </div>
                            <div className="ml-3">
                              <p
                                className="text-sm font-medium"
                                style={{ color: "var(--warning)" }}
                              >
                                {forgotPasswordWarning}
                              </p>
                              {showCreateAccountSuggestion && (
                                <div className="mt-2">
                                  <button
                                    onClick={() => {
                                      setShowForgotPassword(false);
                                      setIsSignUp(true);
                                      setForgotPasswordError("");
                                      setForgotPasswordWarning("");
                                      setShowCreateAccountSuggestion(false);
                                    }}
                                    className="text-sm font-medium hover:opacity-80 transition-opacity"
                                    style={{ color: "var(--primary)" }}
                                  >
                                    Create an account instead →
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex space-x-3">
                        <button
                          onClick={handleForgotPassword}
                          disabled={
                            forgotPasswordLoading || forgotPasswordCooldown > 0
                          }
                          className="flex-1 py-3 px-4 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          style={{
                            backgroundColor:
                              forgotPasswordCooldown > 0
                                ? "var(--muted)"
                                : "var(--primary)",
                            color: "var(--card-bg)",
                            border: "1px solid transparent",
                          }}
                          onMouseEnter={(e) => {
                            if (
                              !forgotPasswordLoading &&
                              forgotPasswordCooldown === 0
                            ) {
                              e.currentTarget.style.backgroundColor =
                                "var(--primary-hover)";
                              e.currentTarget.style.borderColor =
                                "var(--primary-hover)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (
                              !forgotPasswordLoading &&
                              forgotPasswordCooldown === 0
                            ) {
                              e.currentTarget.style.backgroundColor =
                                "var(--primary)";
                              e.currentTarget.style.borderColor =
                                "var(--primary)";
                            }
                          }}
                        >
                          {forgotPasswordLoading
                            ? "Sending..."
                            : "Send Reset Link"}
                        </button>
                        <button
                          onClick={() => {
                            setShowForgotPassword(false);
                            setForgotPasswordEmail("");
                            setForgotPasswordError("");
                            setForgotPasswordWarning("");
                            setShowCreateAccountSuggestion(false);
                          }}
                          className="flex-1 py-3 px-4 rounded-lg font-semibold border transition-colors"
                          style={{
                            borderColor: "var(--sidebar-border)",
                            color: "var(--foreground)",
                            background: "transparent",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "var(--sidebar-bg)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          Cancel
                        </button>
                      </div>

                      {forgotPasswordCooldown > 0 && (
                        <p
                          className="mt-2 text-xs text-center"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Please wait {forgotPasswordCooldown} seconds before
                          requesting another reset link
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Email Verification Popup */}
        <EmailVerificationPopup
          isOpen={showEmailVerificationPopup}
          onClose={() => setShowEmailVerificationPopup(false)}
          userEmail={verificationEmail}
          userName={formData.name}
        />
      </div>
    </div>
  );
}

export default function Auth() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthForm />
    </Suspense>
  );
}
