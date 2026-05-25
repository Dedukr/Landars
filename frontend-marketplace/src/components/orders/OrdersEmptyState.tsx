"use client";

import Link from "next/link";
import { ClipboardList, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface OrdersEmptyStateProps {
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}

export default function OrdersEmptyState({
  hasActiveFilters = false,
  onClearFilters,
}: OrdersEmptyStateProps) {
  return (
    <div
      className="mx-auto max-w-lg rounded-2xl border px-6 py-12 text-center sm:max-w-2xl sm:py-16"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div
        className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full sm:h-20 sm:w-20"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <ClipboardList
          className="h-8 w-8 sm:h-10 sm:w-10"
          style={{ color: "var(--muted-foreground)" }}
          strokeWidth={1.5}
          aria-hidden
        />
      </div>
      <h2
        className="mb-2 text-xl font-bold sm:text-2xl"
        style={{ color: "var(--foreground)" }}
      >
        {hasActiveFilters ? "No matching orders" : "No orders yet"}
      </h2>
      <p
        className="mb-8 text-sm leading-relaxed sm:text-base"
        style={{ color: "var(--muted-foreground)" }}
      >
        {hasActiveFilters
          ? "Try adjusting your search or filters to see more orders."
          : "When you place an order, it will appear here so you can track it anytime."}
      </p>
      <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-stretch sm:flex-nowrap">
        {hasActiveFilters && onClearFilters ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-full whitespace-nowrap px-4 sm:w-auto"
            onClick={onClearFilters}
          >
            Reset filters
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="lg"
          className="h-12 w-full whitespace-nowrap px-4 sm:w-auto"
          asChild
        >
          <Link
            href="/shop"
            className="inline-flex h-12 items-center justify-center gap-2"
          >
            {hasActiveFilters ? "Browse the shop" : "Start your first order"}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-12 w-full whitespace-nowrap px-4 sm:w-auto"
          asChild
        >
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2"
          >
            <Store className="h-4 w-4" aria-hidden />
            Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
