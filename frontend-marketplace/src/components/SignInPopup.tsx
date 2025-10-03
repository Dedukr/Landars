"use client";
import React from "react";
import Link from "next/link";

interface SignInPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignInPopup: React.FC<SignInPopupProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
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
          {/* Heart icon */}
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
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
          </div>

          <h2
            className="text-2xl font-bold mb-3"
            style={{ color: "var(--foreground)" }}
          >
            Sign in to save favorites
          </h2>

          <p
            className="mb-8 leading-relaxed"
            style={{
              color: "var(--foreground)",
              opacity: 0.8,
            }}
          >
            Create an account or sign in to add items to your wishlist and keep
            track of your favorite products.
          </p>

          {/* Action buttons */}
          <div className="space-y-3">
            <Link
              href="/auth/?mode=signin"
              className="w-full py-3 px-4 font-medium transition-all duration-200 block text-center"
              style={{
                background: "var(--primary)",
                color: "#fff",
                borderRadius: "0.75rem",
                border: "1px solid var(--primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--primary-hover)";
                e.currentTarget.style.borderColor = "var(--primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--primary)";
                e.currentTarget.style.borderColor = "var(--primary)";
              }}
              onClick={onClose}
            >
              Sign In
            </Link>

            <Link
              href="/auth/?mode=signup"
              className="w-full py-3 px-4 font-medium transition-all duration-200 block text-center"
              style={{
                background: "transparent",
                color: "var(--primary)",
                borderRadius: "0.75rem",
                border: "1px solid var(--primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--sidebar-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
              onClick={onClose}
            >
              Create Account
            </Link>
          </div>

          <button
            onClick={onClose}
            className="mt-8 text-base underline hover:no-underline transition-all duration-200"
            style={{
              background: "none",
              border: "none",
              padding: "0",
              margin: "0",
              color: "var(--foreground)",
              opacity: 0.7,
              cursor: "pointer",
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignInPopup;
