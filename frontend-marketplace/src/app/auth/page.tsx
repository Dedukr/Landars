"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";

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
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "signup") {
      setIsSignUp(true);
    } else if (mode === "signin") {
      setIsSignUp(false);
    }
  }, [searchParams]);

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

    if (isSignUp) {
      // Validate passwords match
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }

      // Validate password length
      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters long");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          "http://localhost:8000/api/auth/register/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: formData.name,
              email: formData.email,
              password: formData.password,
            }),
          }
        );

        const data = await response.json();

        if (response.ok) {
          login(data.token, data.user);
          router.push("/");
        } else {
          setError(data.error || "Registration failed");
        }
      } catch {
        setError("Network error. Please try again.");
      }
    } else {
      // Sign in logic
      try {
        const response = await fetch("http://localhost:8000/api/auth/login/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          login(data.token, data.user);
          router.push("/");
        } else {
          setError(data.error || "Login failed");
        }
      } catch {
        setError("Network error. Please try again.");
      }
    }

    setLoading(false);
  };

  const toggleMode = () => {
    const newMode = !isSignUp;
    setIsSignUp(newMode);
    setFormData({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    });
    setError("");
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
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm"
                  style={{
                    borderColor: "var(--sidebar-border)",
                    backgroundColor: "var(--card-bg)",
                    color: "var(--foreground)",
                  }}
                  placeholder="Your full name"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>
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
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm"
                style={{
                  borderColor: "var(--sidebar-border)",
                  backgroundColor: "var(--card-bg)",
                  color: "var(--foreground)",
                }}
                placeholder="Email address"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm"
                style={{
                  borderColor: "var(--sidebar-border)",
                  backgroundColor: "var(--card-bg)",
                  color: "var(--foreground)",
                }}
                placeholder={
                  isSignUp ? "Password (min 8 characters)" : "Password"
                }
                value={formData.password}
                onChange={handleChange}
              />
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
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required={isSignUp}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md focus:outline-none focus:z-10 sm:text-sm"
                  style={{
                    borderColor: "var(--sidebar-border)",
                    backgroundColor: "var(--card-bg)",
                    color: "var(--foreground)",
                  }}
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-center" style={{ color: "#ef4444" }}>
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{
                backgroundColor: "var(--primary)",
                borderColor: "var(--primary)",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor =
                    "var(--primary-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = "var(--primary)";
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
