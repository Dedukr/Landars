"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const linkOutline =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded-lg border-2 border-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary)] transition-all hover:bg-[var(--primary)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] sm:w-auto";

export function OrderDetailsErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 pb-28 pt-12"
      style={{ background: "var(--background)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 text-center sm:p-8"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
          }}
        >
          <AlertTriangle
            className="h-7 w-7"
            style={{ color: "var(--destructive)" }}
            aria-hidden
          />
        </div>
        <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
          Something went wrong
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--muted-foreground)" }}
        >
          {message}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {onRetry ? (
            <Button type="button" variant="primary" size="lg" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          <Link href="/orders" className={cn(linkOutline)}>
            My orders
          </Link>
          <Link
            href="/shop"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 sm:w-auto"
          >
            Back to shop
          </Link>
        </div>
      </div>
    </div>
  );
}
