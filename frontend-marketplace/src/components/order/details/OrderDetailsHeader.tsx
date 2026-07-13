"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Home,
  Layers,
  Package,
  Receipt,
  Scale,
  ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getOrderStatusPresentation, toneSurfaceClass } from "@/lib/orderStatusDisplay";
import {
  formatOrderDateLong,
  formatOrderDateShort,
} from "@/lib/orderFormat";
import type { MarketplaceOrderDetail } from "@/lib/orderDetailTypes";
import { formatGbpPrice } from "@/lib/formatPrice";

function formatItemCount(
  total: MarketplaceOrderDetail["total_items"]
): number | null {
  if (total === null || total === undefined) return null;
  const n = typeof total === "number" ? total : parseFloat(String(total));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function formatWeightSnippet(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s === "0" || s === "0.0" || s === "0.00") return null;
  return s;
}

export function OrderDetailsHeader({
  order,
  className,
}: {
  order: MarketplaceOrderDetail;
  className?: string;
}) {
  const status = getOrderStatusPresentation(order.status);
  const { Icon } = status;
  const tone = toneSurfaceClass(status.tone);

  const placed = formatOrderDateLong(order.created_at);
  const placedShort = formatOrderDateShort(order.created_at);
  const deliveryPref = order.delivery_date
    ? formatOrderDateLong(order.delivery_date)
    : null;
  const deliveryOption = order.is_home_delivery
    ? "Home delivery"
    : "Post";

  const itemCount = formatItemCount(order.total_items);
  const weightSnippet = formatWeightSnippet(order.total_weight);
  const totalFormatted = formatGbpPrice(order.total_price);

  const chipBase =
    "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold leading-none transition-colors";

  return (
    <header className={cn("mb-6", className)}>
      <div
        className="relative overflow-hidden rounded-2xl border shadow-sm sm:rounded-3xl"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          className="h-1.5 w-full shrink-0 sm:h-2"
          style={{
            background: `linear-gradient(90deg, ${tone.iconWrap} 0%, color-mix(in srgb, ${tone.iconWrap} 35%, transparent) 55%, transparent 100%)`,
          }}
          aria-hidden
        />

        <div
          className="border-b px-4 py-3 sm:px-5 sm:py-3.5"
          style={{
            borderColor:
              "color-mix(in srgb, var(--sidebar-border) 85%, transparent)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, var(--card-bg)) 0%, var(--card-bg) 100%)",
          }}
        >
          <nav aria-label="Breadcrumb">
            <ol
              className="flex flex-wrap items-center gap-x-0.5 gap-y-1 text-xs font-medium sm:gap-x-1 sm:text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              <li>
                <Link
                  href="/"
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1.5 py-1 transition-colors hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <Home
                    className="h-3.5 w-3.5 shrink-0 opacity-80"
                    aria-hidden
                  />
                  <span>Home</span>
                </Link>
              </li>
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 opacity-50"
                aria-hidden
              />
              <li>
                <Link
                  href="/orders"
                  className="inline-flex min-h-[40px] items-center rounded-lg px-1.5 py-1 transition-colors hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)]"
                >
                  Orders
                </Link>
              </li>
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 opacity-50"
                aria-hidden
              />
              <li className="min-w-0">
                <span
                  className="inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-1 text-xs font-semibold sm:text-sm"
                  style={{
                    borderColor: "var(--sidebar-border)",
                    background:
                      "color-mix(in srgb, var(--sidebar-bg) 65%, var(--card-bg))",
                    color: "var(--foreground)",
                  }}
                  title={`Order #${order.id}`}
                >
                  Order #{order.id}
                </span>
              </li>
            </ol>
          </nav>
        </div>

        <div className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.09]"
            style={{
              background:
                "radial-gradient(120% 70% at 10% 0%, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 52%), linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 42%, color-mix(in srgb, var(--primary) 8%, transparent) 100%)",
            }}
            aria-hidden
          />

          <div className="relative px-4 pb-5 pt-4 sm:px-5 sm:pb-6 sm:pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <Link
                href="/orders"
                className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl px-1 py-1 text-sm font-semibold transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] -ml-1"
                style={{ color: "var(--primary)" }}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                <span className="sm:hidden">Back</span>
                <span className="hidden sm:inline">Back to orders</span>
              </Link>
              <Link
                href="/shop"
                className={cn(
                  "inline-flex min-h-[48px] w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition-all sm:w-auto sm:min-w-[12.5rem]",
                  "hover:brightness-[1.03] active:scale-[0.99]",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--btn-primary)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)]"
                )}
                style={{
                  background: "var(--btn-primary)",
                  color: "var(--btn-primary-fg)",
                }}
              >
                <ShoppingBag
                  className="h-4 w-4 shrink-0 opacity-95"
                  aria-hidden
                />
                <span className="whitespace-nowrap">Continue shopping</span>
              </Link>
            </div>

            <div className="mt-4 sm:mt-5">
              <h1
                id="order-details-title"
                className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-[2rem] lg:leading-tight"
                style={{ color: "var(--foreground)" }}
              >
                Your order
              </h1>
              <p className="sr-only">
                Order reference {order.id}. Current status: {status.label}.
              </p>
            </div>

            {(itemCount != null || weightSnippet) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {itemCount != null ? (
                  <span
                    className={chipBase}
                    style={{
                      borderColor: "var(--sidebar-border)",
                      background:
                        "color-mix(in srgb, var(--card-bg) 88%, var(--sidebar-bg))",
                      color: "var(--foreground)",
                    }}
                  >
                    <Layers className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </span>
                ) : null}
                {weightSnippet ? (
                  <span
                    className={chipBase}
                    style={{
                      borderColor: "var(--sidebar-border)",
                      background:
                        "color-mix(in srgb, var(--card-bg) 88%, var(--sidebar-bg))",
                      color: "var(--foreground)",
                    }}
                  >
                    <Scale className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    <span
                      className="max-w-[10rem] truncate sm:max-w-none"
                      title={weightSnippet}
                    >
                      {weightSnippet} total weight
                    </span>
                  </span>
                ) : null}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-5 lg:mt-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
              <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
                <div className="relative shrink-0">
                  <div
                    className="pointer-events-none absolute -inset-1 rounded-3xl opacity-40 blur-md"
                    style={{ background: tone.iconWrap }}
                    aria-hidden
                  />
                  <div
                    className="relative flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-2xl shadow-md sm:h-16 sm:w-16"
                    style={{ background: tone.iconWrap }}
                    aria-hidden
                  >
                    <Icon
                      className="h-8 w-8 sm:h-9 sm:w-9"
                      style={{ color: tone.iconColor }}
                      strokeWidth={2}
                    />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id="order-status-heading"
                    className="text-[11px] font-semibold uppercase tracking-[0.14em] sm:text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Order status
                  </h2>
                  <p
                    className="mt-1.5 text-2xl font-bold leading-tight tracking-tight sm:text-3xl"
                    style={{ color: "var(--foreground)" }}
                    role="status"
                  >
                    {status.label}
                  </p>
                  <p
                    className="mt-2 max-w-prose text-sm leading-relaxed sm:text-[0.9375rem]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {status.description}
                  </p>
                </div>
              </div>

              <div
                className="flex w-full shrink-0 flex-col gap-3 rounded-2xl border px-4 py-4 sm:max-w-md lg:max-w-xs lg:self-stretch"
                style={{
                  borderColor: tone.border,
                  background: tone.bg,
                  boxShadow:
                    "0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent)",
                }}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  At a glance
                </p>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3 text-sm">
                    <CalendarDays
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: "var(--accent)" }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p
                        className="font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        Placed
                      </p>
                      <p style={{ color: "var(--muted-foreground)" }}>
                        <span className="sm:hidden">{placedShort || "—"}</span>
                        <span className="hidden sm:inline">{placed || "—"}</span>
                      </p>
                    </div>
                  </div>
                  <div
                    className="h-px w-full shrink-0"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, color-mix(in srgb, var(--foreground) 12%, transparent), transparent)",
                    }}
                    aria-hidden
                  />
                  <div className="flex items-start gap-3 text-sm">
                    <Package
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: "var(--accent)" }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p
                        className="font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        Delivery option
                      </p>
                      <p style={{ color: "var(--muted-foreground)" }}>
                        {deliveryOption}
                      </p>
                    </div>
                  </div>
                  {deliveryPref ? (
                    <>
                      <div
                        className="h-px w-full shrink-0"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--foreground) 12%, transparent), transparent)",
                        }}
                        aria-hidden
                      />
                      <p
                        className="text-sm leading-snug"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Preferred date:{" "}
                        <span
                          className="font-semibold"
                          style={{ color: "var(--foreground)" }}
                        >
                          {deliveryPref}
                        </span>
                      </p>
                    </>
                  ) : null}
                  {totalFormatted ? (
                    <>
                      <div
                        className="h-px w-full shrink-0"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--foreground) 12%, transparent), transparent)",
                        }}
                        aria-hidden
                      />
                      <div className="flex items-start gap-3">
                        <Receipt
                          className="mt-0.5 h-4 w-4 shrink-0"
                          style={{ color: "var(--accent)" }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "var(--foreground)" }}
                          >
                            Order total
                          </p>
                          <p
                            className="mt-0.5 text-xl font-bold tabular-nums tracking-tight sm:text-2xl"
                            style={{ color: "var(--foreground)" }}
                          >
                            {totalFormatted}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
