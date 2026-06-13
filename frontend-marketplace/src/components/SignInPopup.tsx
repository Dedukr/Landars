"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, ShoppingCart, X } from "lucide-react";
import { getAuthUrl } from "@/utils/authHelpers";

export type SignInPopupVariant = "wishlist" | "cart";

interface SignInPopupProps {
  isOpen: boolean;
  onClose: () => void;
  /** Defaults to wishlist (heart + favorites copy). */
  variant?: SignInPopupVariant;
}

const COPY: Record<
  SignInPopupVariant,
  { title: string; description: string; Icon: typeof Heart }
> = {
  wishlist: {
    title: "Sign in to save favorites",
    description:
      "Create an account or sign in to add items to your wishlist and keep track of your favorite products.",
    Icon: Heart,
  },
  cart: {
    title: "Sign in to add to your basket",
    description:
      "Create an account or sign in to add items to your basket and checkout when you are ready.",
    Icon: ShoppingCart,
  },
};

const SignInPopup: React.FC<SignInPopupProps> = ({
  isOpen,
  onClose,
  variant = "wishlist",
}) => {
  const pathname = usePathname();
  const signInUrl = getAuthUrl({ mode: "signin", next: pathname });
  const signUpUrl = getAuthUrl({ mode: "signup", next: pathname });
  const { title, description, Icon } = COPY[variant];

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-popup-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:opacity-80"
          style={{
            color: "var(--muted-foreground)",
            background: "var(--sidebar-bg)",
            border: "1px solid var(--sidebar-border)",
          }}
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <div
              className="p-4 rounded-full"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <Icon
                className="h-9 w-9"
                strokeWidth={2}
                style={{ color: "var(--accent)" }}
                aria-hidden
              />
            </div>
          </div>

          <h2
            id="sign-in-popup-title"
            className="text-2xl font-bold mb-3"
            style={{ color: "var(--foreground)" }}
          >
            {title}
          </h2>

          <p
            className="mb-8 leading-relaxed"
            style={{
              color: "var(--foreground)",
              opacity: 0.8,
            }}
          >
            {description}
          </p>

          <div className="space-y-3">
            <Link
              href={signInUrl}
              className="w-full py-3 px-4 font-medium transition-all duration-200 block text-center"
              style={{
                background: "var(--btn-primary)",
                color: "var(--btn-primary-fg)",
                borderRadius: "0.75rem",
                border: "1px solid var(--btn-primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--btn-primary-hover)";
                e.currentTarget.style.borderColor = "var(--btn-primary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--btn-primary)";
                e.currentTarget.style.borderColor = "var(--btn-primary)";
              }}
              onClick={onClose}
            >
              Sign In
            </Link>

            <Link
              href={signUpUrl}
              className="w-full py-3 px-4 font-medium transition-all duration-200 block text-center"
              style={{
                background: "transparent",
                color: "var(--btn-primary)",
                borderRadius: "0.75rem",
                border: "1px solid var(--btn-primary)",
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
        </div>
      </div>
    </div>
  );
};

export default SignInPopup;
