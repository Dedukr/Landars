"use client";

import Link from "next/link";
import { Heart, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function WishlistEmptyState() {
  return (
    <div
      className="rounded-2xl border px-6 py-12 sm:py-16 text-center max-w-lg mx-auto"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div
        className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full mb-5"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <Heart
          className="w-8 h-8 sm:w-10 sm:h-10"
          style={{ color: "var(--muted-foreground)" }}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
        Your wishlist is empty
      </h2>
      <p className="text-sm sm:text-base mb-8 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
        Save products you like and come back to them later.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
        <Button variant="primary" size="lg" fullWidth className="sm:w-auto sm:min-w-[200px]" asChild>
          <Link href="/shop">Browse the shop</Link>
        </Button>
        <Button variant="outline" size="lg" fullWidth className="sm:w-auto" asChild>
          <Link href="/" className="inline-flex items-center justify-center gap-2">
            <Store className="w-4 h-4" aria-hidden />
            Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
