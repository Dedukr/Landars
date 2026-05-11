"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { AlertCircle, SearchX } from "lucide-react";

interface ShopEmptyStateProps {
  onResetFilters?: () => void;
}

export function ShopEmptyState({ onResetFilters }: ShopEmptyStateProps) {
  return (
    <div
      className="rounded-2xl border px-8 py-12 text-center max-w-lg mx-auto"
      style={{
        borderColor: "var(--sidebar-border)",
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <SearchX className="w-8 h-8" aria-hidden style={{ color: "var(--muted-foreground)" }} strokeWidth={1.75} />
      </div>
      <h3 className="text-lg font-bold mb-2" style={{ color: "var(--foreground)" }}>
        No products match your filters
      </h3>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--muted-foreground)" }}>
        Try clearing search, widening your price range, or choosing different categories.
      </p>
      <Button type="button" variant="primary" size="lg" onClick={onResetFilters}>
        Reset filters
      </Button>
    </div>
  );
}

interface ShopErrorStateProps {
  onRetry: () => void;
}

export function ShopErrorState({ onRetry }: ShopErrorStateProps) {
  return (
    <div
      className="rounded-2xl border px-8 py-10 text-center max-w-lg mx-auto"
      style={{
        borderColor: "var(--destructive)",
        background: "color-mix(in srgb, var(--destructive) 10%, var(--card-bg))",
      }}
      role="alert"
    >
      <div className="flex justify-center mb-4">
        <AlertCircle className="w-10 h-10" style={{ color: "var(--destructive)" }} aria-hidden strokeWidth={1.75} />
      </div>
      <h3 className="text-lg font-bold mb-2" style={{ color: "var(--foreground)" }}>
        We couldn&apos;t load products
      </h3>
      <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--muted-foreground)" }}>
        Please check your connection and try again. If the issue continues, visit us again shortly.
      </p>
      <Button type="button" variant="primary" size="lg" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
