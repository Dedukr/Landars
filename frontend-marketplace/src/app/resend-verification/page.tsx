"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { httpClient } from "@/utils/httpClient";
import { EmailInput } from "@/components/ui/EmailInput";

export default function ResendVerificationPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await httpClient.post("/api/auth/resend-verification/", {
        email,
      });

      setMessage(
        (response as { message?: string }).message ||
          "Verification email sent successfully!"
      );
    } catch (error: unknown) {
      setError((error as Error).message || "Failed to send verification email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Resend Verification Email
          </h1>
          <p className="text-gray-600">
            Enter your email address to receive a new verification link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Email Address
            </label>
            <EmailInput
              value={email}
              onChange={(email, isValid) => {
                setEmail(email);
                if (!isValid) {
                  setError("Please enter a valid email address");
                } else {
                  setError("");
                }
              }}
              placeholder="Enter your email address"
              required
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          {message && (
            <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send Verification Email"}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push("/auth")}
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
