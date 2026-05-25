"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface OrdersErrorStateProps {
  onRetry?: () => void;
}

export default function OrdersErrorState({ onRetry }: OrdersErrorStateProps) {
  return (
    <div
      className="mx-auto max-w-lg rounded-2xl border px-5 py-10 text-center sm:px-8 sm:py-12"
      role="alert"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div
        className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <AlertTriangle
          className="h-7 w-7"
          style={{ color: "var(--destructive)" }}
          aria-hidden
        />
      </div>
      <h2
        className="mb-2 text-lg font-bold sm:text-xl"
        style={{ color: "var(--foreground)" }}
      >
        We could not load your orders
      </h2>
      <p
        className="mb-6 text-sm leading-relaxed"
        style={{ color: "var(--muted-foreground)" }}
      >
        Please try again, or return to the shop.
      </p>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        {onRetry ? (
          <Button type="button" variant="primary" size="lg" onClick={onRetry} className="w-full sm:w-auto">
            Try again
          </Button>
        ) : null}
        <Button variant="outline" size="lg" className="w-full sm:w-auto" asChild>
          <Link href="/shop">Back to shop</Link>
        </Button>
      </div>
    </div>
  );
}
