import React from "react";
import Link from "next/link";
import { LockKeyhole, ShoppingBag } from "lucide-react";

interface NotAuthenticatedStateProps {
  title?: string;
  description?: string;
  signInHref: string;
  showShopLink?: boolean;
}

export default function NotAuthenticatedState({
  title = "Sign in to continue",
  description = "You need to be signed in to access this page.",
  signInHref,
  showShopLink = false,
}: NotAuthenticatedStateProps) {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <div className="text-center max-w-sm w-full">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "var(--sidebar-bg)" }}
        >
          <LockKeyhole
            className="w-8 h-8"
            style={{ color: "var(--muted-foreground)" }}
          />
        </div>
        <h2
          className="text-xl font-bold mb-2"
          style={{ color: "var(--foreground)" }}
        >
          {title}
        </h2>
        <p
          className="text-sm leading-relaxed mb-6"
          style={{ color: "var(--muted-foreground)" }}
        >
          {description}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={signInHref}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 shadow-sm"
            style={{ background: "var(--primary)", color: "white" }}
          >
            Sign In
          </Link>
          {showShopLink && (
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 hover:opacity-80"
              style={{
                borderColor: "var(--sidebar-border)",
                color: "var(--foreground)",
                background: "var(--card-bg)",
              }}
            >
              <ShoppingBag className="w-4 h-4" />
              Browse Shop
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
