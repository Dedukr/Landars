"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { httpClient } from "@/utils/httpClient";
import {
  describeAuthError,
  formatCountdown,
  formatWaitTime,
  getAuthErrorPayload,
  getSafeNextRedirect,
  describeResendQueuedNotice,
  type AuthErrorCode,
  type DescribedAuthError,
} from "@/utils/authHelpers";
import { AUTH_FETCH_TIMEOUT_MS } from "@/utils/fetchWithTimeout";
import { hasSolidAuthSession } from "@/utils/authSessionGuard";
import EmailVerificationPopup from "@/components/EmailVerificationPopup";
import { latinScriptError } from "@/utils/latinValidation";
import { normalizeEmail, validateEmail } from "@/utils/emailValidation";

interface AuthResponse {
  access?: string;
  refresh?: string;
  user: {
    id: number;
    name: string;
    first_name?: string | null;
    surname?: string | null;
    email: string;
  };
  email_verification_required?: boolean;
  /** `email_not_verified` when a sign-in hit an unverified account. */
  code?: string;
  /** False when the backend could not queue the verification email. */
  email_queued?: boolean;
  /** True when an unfinished sign-up was resumed instead of duplicated. */
  resumed?: boolean;
  message?: string;
}

interface ResendResponse {
  message?: string;
  already_verified?: boolean;
  email_queued?: boolean;
  next_request_allowed_in?: number;
}

/** Applies to rate limits the server did not put a duration on. */
const DEFAULT_RATE_LIMIT_SECONDS = 60;

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    first_name: "",
    surname: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
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
  const [emailQueued, setEmailQueued] = useState(true);
  const [emailFieldError, setEmailFieldError] = useState("");
  const [typoSuggestion, setTypoSuggestion] = useState<string | null>(null);
  // Sign-in hit an unverified account: (normalised) email + resend feedback
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [rateLimitRemaining, setRateLimitRemaining] = useState(0);
  // Synchronous in-flight guards: `loading` state lands after a re-render, so
  // two submit events in the same tick would both pass a state-only check.
  const submittingRef = useRef(false);
  const resendingRef = useRef(false);
  const forgotSubmittingRef = useRef(false);
  // Normalised email the customer chose to keep despite a typo suggestion
  const typoAcknowledgedRef = useRef<string | null>(null);
  const router = useRouter();
  const { login, user, token, loading: authLoading } = useAuth();

  // Redirect only when both user + token are present (avoid half-session bounce)
  useEffect(() => {
    if (authLoading) return;
    if (hasSolidAuthSession(token, user)) {
      const next = getSafeNextRedirect(searchParams.get("next"));
      router.replace(next || "/");
    }
  }, [authLoading, user, token, searchParams, router]);

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
      setFormData((prev) => ({ ...prev, email: safeDecode(email) }));

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

  // Rate-limit countdown: keeps the submit button disabled until the server's
  // retry-after has passed (one interval for the whole countdown)
  const rateLimited = rateLimitRemaining > 0;
  useEffect(() => {
    if (!rateLimited) return;
    const interval = setInterval(() => {
      setRateLimitRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimited]);

  // Drop the "too many attempts" message once the wait is over
  useEffect(() => {
    if (rateLimitRemaining === 0 && errorCode === "rate_limited") {
      setError("");
      setErrorCode(null);
    }
  }, [rateLimitRemaining, errorCode]);

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

  /** Show a described API failure; rate limits also start the button countdown. */
  const showAuthError = (described: DescribedAuthError, err: unknown) => {
    setError(described.message);
    setErrorCode(described.code);
    if (described.code === "rate_limited") {
      setRateLimitRemaining(described.retryAfter ?? DEFAULT_RATE_LIMIT_SECONDS);
    }
    if (
      described.code === "validation_error" &&
      getAuthErrorPayload(err)?.field === "email"
    ) {
      setEmailFieldError(described.message);
    }
  };

  const submitAuth = async (options: { typoAcknowledged?: boolean } = {}) => {
    if (submittingRef.current || rateLimitRemaining > 0) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");
    setErrorCode(null);
    setSuccessMessage("");
    setShowCreateAccountSuggestion(false);
    setEmailFieldError("");
    setTypoSuggestion(null);

    try {
      // What we validate is exactly what we send (and what the backend stores)
      const email = normalizeEmail(formData.email);
      const emailResult = validateEmail(email, {
        allowDisposable: isSignUp ? false : true,
        checkTypos: isSignUp,
      });

      if (!emailResult.isValid) {
        const message = emailResult.error || "Enter a valid email address";
        setEmailFieldError(message);
        setError(message);
        return;
      }

      if (isSignUp) {
        // Validate passwords match
        if (formData.password !== formData.confirmPassword) {
          setError("Passwords do not match");
          return;
        }

        // Validate password strength
        const passwordError = validatePassword(formData.password);
        if (passwordError) {
          setError(passwordError);
          return;
        }

        if (!formData.first_name.trim() || !formData.surname.trim()) {
          setError("First name and surname are required");
          return;
        }

        const firstNameLatinError = latinScriptError(formData.first_name);
        if (firstNameLatinError) {
          setError(`First name: ${firstNameLatinError}`);
          return;
        }
        const surnameLatinError = latinScriptError(formData.surname);
        if (surnameLatinError) {
          setError(`Surname: ${surnameLatinError}`);
          return;
        }

        // Typo guard (sign-up only): a mistyped domain creates an account whose
        // verification email never arrives. Ask once; "Keep as typed" proceeds.
        const suggestion = emailResult.suggestions?.[0];
        if (
          suggestion &&
          !options.typoAcknowledged &&
          typoAcknowledgedRef.current !== email
        ) {
          setTypoSuggestion(suggestion);
          return;
        }

        try {
          const data = await httpClient.post<AuthResponse>(
            "/api/auth/register/",
            {
              first_name: formData.first_name.trim(),
              surname: formData.surname.trim(),
              email,
              password: formData.password,
            },
            {
              skipAuth: true,
              skipCSRF: true,
              timeoutMs: AUTH_FETCH_TIMEOUT_MS,
            }
          );

          // Register always requires email verification (no immediate JWT).
          // `resumed` (an unfinished sign-up was continued) looks the same.
          if (data.email_verification_required) {
            setVerificationEmail(email);
            // Only an explicit `false` means the email was not queued
            setEmailQueued(data.email_queued !== false);
            setShowEmailVerificationPopup(true);
            return;
          }

          setError("Unexpected registration response. Please try signing in.");
        } catch (err: unknown) {
          showAuthError(describeAuthError(err, "register"), err);
        }
      } else {
        // Sign in logic
        try {
          const data = await httpClient.post<AuthResponse>(
            "/api/auth/login/",
            {
              email,
              password: formData.password,
            },
            {
              skipAuth: true,
              skipCSRF: true,
              timeoutMs: AUTH_FETCH_TIMEOUT_MS,
            }
          );

          // Unverified account: not a success, not a failure — a warning with
          // a persistent Resend button (rendered below the form fields)
          if (
            data.email_verification_required ||
            data.code === "email_not_verified"
          ) {
            setUnverifiedEmail(email);
            setResendFeedback(null);
            return;
          }

          // Access in SPA; refresh is set as httpOnly cookie by the API
          if (data.access) {
            login({ access: data.access }, data.user);
            const next = getSafeNextRedirect(searchParams.get("next"));
            // replace avoids stacking /auth in history; safe next never loops to /auth
            router.replace(next || "/");
            return;
          }

          setError("Unexpected login response. Please try again.");
        } catch (err: unknown) {
          setUnverifiedEmail(null);
          showAuthError(describeAuthError(err, "login"), err);
        }
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitAuth();
  };

  const handleUseTypoSuggestion = () => {
    if (!typoSuggestion) return;
    setFormData((prev) => ({ ...prev, email: typoSuggestion }));
    setTypoSuggestion(null);
    setEmailFieldError("");
  };

  const handleKeepTypedEmail = () => {
    typoAcknowledgedRef.current = normalizeEmail(formData.email);
    setTypoSuggestion(null);
    void submitAuth({ typoAcknowledged: true });
  };

  /** Resend from the sign-in "please verify your email" warning. */
  const handleResendVerification = async () => {
    if (!unverifiedEmail || resendingRef.current || resendCooldown > 0) return;
    resendingRef.current = true;
    setResendLoading(true);
    setResendFeedback(null);

    try {
      const data = await httpClient.post<ResendResponse>(
        "/api/auth/resend-verification/",
        { email: unverifiedEmail },
        {
          skipAuth: true,
          skipCSRF: true,
          timeoutMs: AUTH_FETCH_TIMEOUT_MS,
        }
      );

      if (data?.already_verified) {
        setUnverifiedEmail(null);
        setSuccessMessage(
          "Your email address is already verified. You can sign in now."
        );
      } else {
        const notice = describeResendQueuedNotice(data, unverifiedEmail);
        setResendFeedback(notice);
      }
      const wait = Number(data?.next_request_allowed_in);
      if (Number.isFinite(wait) && wait > 0) {
        setResendCooldown(Math.ceil(wait));
      }
    } catch (err: unknown) {
      const described = describeAuthError(err, "resend");
      if (
        (described.code === "cooldown" || described.code === "rate_limited") &&
        described.retryAfter
      ) {
        // The live countdown under the button is the message
        setResendCooldown(described.retryAfter);
      } else {
        setResendFeedback({ kind: "error", message: described.message });
      }
    } finally {
      resendingRef.current = false;
      setResendLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (
      forgotPasswordCooldown > 0 ||
      forgotPasswordLoading ||
      forgotSubmittingRef.current
    )
      return;
    forgotSubmittingRef.current = true;

    try {
      setForgotPasswordLoading(true);
      setForgotPasswordError("");
      setForgotPasswordWarning("");
      setShowCreateAccountSuggestion(false);

      const resetEmail = normalizeEmail(forgotPasswordEmail);
      if (!resetEmail) {
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
          email: resetEmail,
        },
        { skipAuth: true, skipCSRF: true, timeoutMs: AUTH_FETCH_TIMEOUT_MS }
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

      const described = describeAuthError(err, "reset");
      const payload = getAuthErrorPayload(err);

      if (typeof payload?.warning === "string" && payload.warning) {
        setForgotPasswordWarning(payload.warning);
        if (payload.suggestion === "create_account") {
          setShowCreateAccountSuggestion(true);
        }
        return; // Don't set error for warnings
      }

      if (
        (described.code === "cooldown" || described.code === "rate_limited") &&
        described.retryAfter
      ) {
        // The countdown under the buttons is the message
        setForgotPasswordCooldown(described.retryAfter);
        return;
      }
      if (described.code === "account_not_found") {
        setShowCreateAccountSuggestion(true);
      }
      setForgotPasswordError(described.message);
    } finally {
      forgotSubmittingRef.current = false;
      setForgotPasswordLoading(false);
    }
  };

  const switchMode = (toSignUp: boolean, keepEmail: boolean) => {
    setIsSignUp(toSignUp);
    setFormData({
      first_name: "",
      surname: "",
      email: keepEmail ? formData.email : "",
      password: "",
      confirmPassword: "",
    });
    setError("");
    setErrorCode(null);
    setSuccessMessage("");
    setEmailFieldError("");
    setTypoSuggestion(null);
    setUnverifiedEmail(null);
    setResendFeedback(null);
    // Update URL to reflect the new mode, preserve next if present
    const nextParam = searchParams.get("next");
    const next = nextParam ? `&next=${encodeURIComponent(nextParam)}` : "";
    const newUrl = toSignUp ? `/auth?mode=signup${next}` : `/auth?mode=signin${next}`;
    router.replace(newUrl);
  };

  // Preserve email when switching from sign-in to sign-up
  const toggleMode = () => switchMode(!isSignUp, !isSignUp);

  // Duplicate sign-up: continue as a sign-in (keeps the email) ...
  const handleSignInInstead = () => switchMode(false, true);

  // ... or reset the password of the existing account
  const handleResetPasswordInstead = () => {
    setForgotPasswordEmail(formData.email); // Pre-fill with current email
    setForgotPasswordError("");
    setForgotPasswordWarning("");
    setError("");
    setErrorCode(null);
    setShowForgotPassword(true);
  };

  // The warning belongs to the address that was just refused: hide it in
  // sign-up mode or once the customer edits the email
  const showUnverifiedBox =
    !isSignUp &&
    unverifiedEmail !== null &&
    normalizeEmail(formData.email) === unverifiedEmail;

  // Wait for auth bootstrap; solid session keeps spinner while redirecting
  if (authLoading || hasSolidAuthSession(token, user)) {
    return (
      <div className="min-h-screen flex items-center justify-center auth-container">
        <div
          className="animate-spin rounded-full h-10 w-10 border-b-2"
          style={{ borderColor: "var(--btn-primary)" }}
          aria-label="Loading"
        />
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
                color: "var(--btn-primary)",
                border: "1px solid var(--btn-primary)",
                background: "transparent",
              }}
            >
              {isSignUp ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            {isSignUp && (
              <>
                <div>
                  <label
                    htmlFor="first_name"
                    className="block text-sm font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    First name
                  </label>
                  <input
                    id="first_name"
                    name="first_name"
                    type="text"
                    autoComplete="given-name"
                    required={isSignUp}
                    className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                    placeholder="Your first name"
                    value={formData.first_name}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label
                    htmlFor="surname"
                    className="block text-sm font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    Surname
                  </label>
                  <input
                    id="surname"
                    name="surname"
                    type="text"
                    autoComplete="family-name"
                    required={isSignUp}
                    className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                    placeholder="Your surname"
                    value={formData.surname}
                    onChange={handleChange}
                  />
                </div>
              </>
            )}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => {
                  handleChange(e);
                  if (emailFieldError) setEmailFieldError("");
                  if (typoSuggestion) setTypoSuggestion(null);
                }}
                placeholder="Email address"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm auth-input"
                style={
                  emailFieldError
                    ? { borderColor: "var(--destructive)" }
                    : undefined
                }
                aria-invalid={Boolean(emailFieldError)}
                aria-describedby={
                  emailFieldError ? "email-error" : undefined
                }
              />
              {emailFieldError ? (
                <p
                  id="email-error"
                  role="alert"
                  className="mt-2 text-sm"
                  style={{ color: "var(--destructive)" }}
                >
                  {emailFieldError}
                </p>
              ) : null}
              {typoSuggestion ? (
                <div
                  className="mt-2 p-3 rounded-md border text-sm"
                  role="status"
                  style={{
                    backgroundColor: "rgba(251, 191, 36, 0.1)",
                    borderColor: "rgba(251, 191, 36, 0.35)",
                    color: "var(--foreground)",
                  }}
                >
                  <p className="mb-2">{`Did you mean ${typoSuggestion}?`}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleUseTypoSuggestion}
                      className="px-3 py-1.5 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: "var(--btn-primary)",
                        color: "var(--btn-primary-fg)",
                      }}
                    >
                      {`Use ${typoSuggestion}`}
                    </button>
                    <button
                      type="button"
                      onClick={handleKeepTypedEmail}
                      className="px-3 py-1.5 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                      style={{
                        color: "var(--btn-primary)",
                        border: "1px solid var(--btn-primary)",
                        background: "transparent",
                      }}
                    >
                      Keep as typed
                    </button>
                  </div>
                </div>
              ) : null}
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
                      ? "Password (8+ chars, letter + number, not common)"
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
              role="alert"
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
              {errorCode === "account_not_found" ? (
                <div>
                  {error} Would you like to{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(true);
                      setError("");
                      setErrorCode(null);
                      setShowCreateAccountSuggestion(false);
                      const url = new URL(window.location.href);
                      url.searchParams.set("mode", "signup");
                      window.history.replaceState({}, "", url.toString());
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
              {errorCode === "email_exists" && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleSignInInstead}
                    className="px-3 py-1.5 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: "var(--btn-primary)",
                      color: "var(--btn-primary-fg)",
                    }}
                  >
                    Sign in instead
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPasswordInstead}
                    className="px-3 py-1.5 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                    style={{
                      color: "var(--btn-primary)",
                      border: "1px solid var(--btn-primary)",
                      background: "transparent",
                    }}
                  >
                    Reset password
                  </button>
                </div>
              )}
              {errorCode === "account_inactive" && (
                <div className="mt-2">
                  <Link
                    href="/contact"
                    className="text-sm font-medium underline hover:opacity-80"
                    style={{ color: "var(--primary)" }}
                  >
                    Contact support
                  </Link>
                </div>
              )}
            </div>
          )}

          {showUnverifiedBox && (
            <div
              className="text-sm"
              role="status"
              style={{
                color: "var(--foreground)",
                backgroundColor: "rgba(251, 191, 36, 0.1)",
                border: "1px solid rgba(251, 191, 36, 0.35)",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                marginTop: "0.5rem",
              }}
            >
              <p className="text-center">
                Please verify your email address (
                <span className="font-semibold">{unverifiedEmail}</span>) before
                signing in. Check your inbox (and spam folder) for the
                verification link, or send yourself a new one.
              </p>
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => void handleResendVerification()}
                  disabled={resendLoading || resendCooldown > 0}
                  aria-busy={resendLoading}
                  className="text-sm font-medium underline disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: "var(--primary)" }}
                >
                  Resend verification email
                </button>
              </div>
              {resendLoading ? (
                <p className="mt-2 text-xs text-center">Sending...</p>
              ) : null}
              {resendFeedback ? (
                <p
                  role={resendFeedback.kind === "error" ? "alert" : undefined}
                  className="mt-2 text-xs text-center"
                  style={{
                    color:
                      resendFeedback.kind === "error"
                        ? "var(--destructive)"
                        : "var(--foreground)",
                  }}
                >
                  {resendFeedback.message}
                </p>
              ) : null}
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
                      Resend available in {formatWaitTime(resendCooldown)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
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
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || rateLimitRemaining > 0}
              className="w-full py-3 px-4 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{
                backgroundColor: "var(--btn-primary)",
                color: "var(--btn-primary-fg)",
                border: "1px solid var(--btn-primary)",
              }}
              onMouseEnter={(e) => {
                if (!loading && rateLimitRemaining === 0) {
                  e.currentTarget.style.backgroundColor =
                    "var(--btn-primary-hover)";
                  e.currentTarget.style.borderColor = "var(--btn-primary-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && rateLimitRemaining === 0) {
                  e.currentTarget.style.backgroundColor = "var(--btn-primary)";
                  e.currentTarget.style.borderColor = "var(--btn-primary)";
                }
              }}
            >
              {loading
                ? isSignUp
                  ? "Creating account..."
                  : "Signing in..."
                : rateLimitRemaining > 0
                ? `Try again in ${formatCountdown(rateLimitRemaining)}`
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
                          Please wait {formatWaitTime(forgotPasswordCooldown)}{" "}
                          before requesting another reset link
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
          userName={`${formData.first_name} ${formData.surname}`.trim()}
          next={searchParams.get("next")}
          emailQueued={emailQueued}
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
