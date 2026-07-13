"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, ClipboardList, Home, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface OrdersPageHeaderProps {
  totalCount?: number;
  isLoading?: boolean;
  className?: string;
}

export default function OrdersPageHeader({
  totalCount,
  isLoading = false,
  className,
}: OrdersPageHeaderProps) {
  const showCount =
    !isLoading && totalCount !== undefined && totalCount > 0;
  const countLabel =
    totalCount === 1 ? "1 order" : `${totalCount} orders`;

  return (
    <header className={cn("mb-6 sm:mb-8", className)}>
      <nav
        className="mb-3 flex flex-wrap items-center gap-1 text-xs font-medium sm:text-sm"
        aria-label="Breadcrumb"
      >
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          style={{ color: "var(--muted-foreground)" }}
        >
          <Home className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        <span style={{ color: "var(--foreground)" }}>Orders</span>
      </nav>

      <section
        className="relative overflow-hidden rounded-2xl border shadow-sm sm:rounded-3xl"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
        aria-labelledby="orders-hero-title"
        aria-busy={isLoading}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 42%, color-mix(in srgb, var(--primary) 8%, transparent) 100%)",
          }}
          aria-hidden
        />

        <div className="relative px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-center lg:gap-8">
            <div className="min-w-0 lg:col-span-8">
              <Link
                href="/shop"
                className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-1 text-sm font-semibold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card-bg)]"
                style={{ color: "var(--primary)" }}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                <span className="sm:hidden">Shop</span>
                <span className="hidden sm:inline">Browse the shop</span>
              </Link>

              <div className="flex flex-wrap items-start gap-3 gap-y-2">
                <h1
                  id="orders-hero-title"
                  className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl"
                  style={{ color: "var(--foreground)" }}
                >
                  Your orders
                </h1>
                {showCount ? (
                  <span
                    className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums sm:text-sm"
                    style={{
                      background: "var(--sidebar-bg)",
                      borderColor: "var(--sidebar-border)",
                      color: "var(--foreground)",
                    }}
                  >
                    {countLabel}
                  </span>
                ) : null}
              </div>

              <p
                className="mt-2 max-w-2xl text-sm leading-relaxed sm:text-[0.9375rem]"
                style={{ color: "var(--muted-foreground)" }}
              >
                Review your previous LandarsFood orders and check their current status.
                Track your order requests and view details in one place.
              </p>

              <div className="mt-5">
                <Button
                  variant="primary"
                  size="md"
                  className="min-h-[48px] w-full sm:w-auto sm:min-w-[11rem]"
                  asChild
                >
                  <Link href="/shop" className="inline-flex items-center justify-center gap-2">
                    <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden />
                    Start a new order
                  </Link>
                </Button>
              </div>
            </div>

            <div
              className="hidden lg:col-span-4 lg:flex lg:flex-col lg:items-center lg:justify-center lg:rounded-2xl lg:border lg:px-5 lg:py-6"
              style={{
                background: "var(--sidebar-bg)",
                borderColor: "var(--sidebar-border)",
              }}
            >
              <div
                className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--sidebar-border)",
                  color: "var(--accent)",
                }}
              >
                <ClipboardList className="h-7 w-7" strokeWidth={2} aria-hidden />
              </div>
              <p
                className="text-center text-sm font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Order history
              </p>
              <p
                className="mt-1 text-center text-xs leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                {isLoading
                  ? "Loading your orders…"
                  : showCount
                    ? "Tap any order to see full details and delivery updates."
                    : "Your past orders will show up here after checkout."}
              </p>
            </div>
          </div>
        </div>
      </section>
    </header>
  );
}
