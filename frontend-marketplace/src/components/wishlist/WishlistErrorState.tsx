"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface WishlistErrorStateProps {
  onRetry?: () => void;
}

export default function WishlistErrorState({ onRetry }: WishlistErrorStateProps) {
  return (
    <div
      className="rounded-2xl border px-5 py-10 sm:px-8 sm:py-12 text-center max-w-lg mx-auto"
      role="alert"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div
        className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <AlertTriangle
          className="w-7 h-7"
          style={{ color: "var(--destructive)" }}
          aria-hidden="true"
        />
      </div>
      <h2 className="text-lg sm:text-xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
        We could not load your wishlist
      </h2>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--muted-foreground)" }}>
        Please try again, or return to the shop.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onRetry && (
          <Button type="button" variant="primary" size="lg" onClick={onRetry} className="w-full sm:w-auto">
            Try again
          </Button>
        )}
        <Button variant="outline" size="lg" className="w-full sm:w-auto" asChild>
          <Link href="/shop">Back to shop</Link>
        </Button>
      </div>
    </div>
  );
}
