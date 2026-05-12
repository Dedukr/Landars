"use client";
import Link from "next/link";
import { ShoppingBag, ArrowRight } from "lucide-react";

export default function EmptyCartState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in-up">
      {/* Icon */}
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{ background: "var(--sidebar-bg)" }}
        aria-hidden="true"
      >
        <ShoppingBag
          className="w-9 h-9"
          style={{ color: "var(--muted-foreground)" }}
        />
      </div>

      {/* Text */}
      <h2
        className="text-xl sm:text-2xl font-bold mb-2"
        style={{ color: "var(--foreground)" }}
      >
        Your basket is empty
      </h2>
      <p
        className="text-sm sm:text-base mb-8 max-w-xs leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        Browse the shop and add something tasty to your order.
      </p>

      {/* Primary CTA */}
      <Link
        href="/shop"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] hover:opacity-90"
        style={{ background: "var(--primary)", color: "white" }}
      >
        Go to shop
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>

      {/* Secondary CTA */}
      <Link
        href="/"
        className="mt-4 text-sm transition-colors hover:opacity-80"
        style={{ color: "var(--muted-foreground)" }}
      >
        Back to home
      </Link>
    </div>
  );
}
