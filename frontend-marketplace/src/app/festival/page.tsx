"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchFestivalProducts,
  fetchFestivalStatus,
  formatFestivalMoney,
  placeFestivalOrder,
  type FestivalProduct,
  type FestivalStatus,
} from "@/lib/festivalApi";
import { getAuthUrl } from "@/utils/authHelpers";

const MAX_QTY = 99;

function PrinterBadge({ status }: { status: FestivalStatus | null }) {
  if (!status) {
    return (
      <span
        className="inline-flex items-center gap-2 text-sm"
        style={{ color: "var(--muted-foreground)" }}
        aria-live="polite"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-gray-400" aria-hidden />
        Checking printer…
      </span>
    );
  }
  const delayed = status.queued_jobs > 0 && status.online;
  const colour = !status.enabled
    ? "#9ca3af"
    : !status.online && status.mode === "cloudprnt"
      ? "var(--destructive)"
      : delayed
        ? "#d97706"
        : "var(--success)";
  const label = !status.enabled
    ? "Festival disabled"
    : status.mode === "disabled"
      ? "Print mode off (dev)"
      : !status.online
        ? "Printer offline"
        : delayed
          ? `Printer online · ${status.queued_jobs} queued`
          : "Printer online";
  return (
    <span
      className="inline-flex items-center gap-2 text-sm font-medium"
      style={{ color: "var(--foreground)" }}
      aria-live="polite"
      role="status"
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: colour }}
        aria-hidden
      />
      {label}
    </span>
  );
}

export default function FestivalTillPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<FestivalProduct[]>([]);
  const [status, setStatus] = useState<FestivalStatus | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID()
  );
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canUse = Boolean(user?.can_use_festival);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [productRows, statusRow] = await Promise.all([
        fetchFestivalProducts(),
        fetchFestivalStatus(),
      ]);
      setProducts(productRows);
      setStatus(statusRow);
      setQuantities((prev) => {
        const next: Record<number, number> = {};
        for (const p of productRows) {
          next[p.id] = prev[p.id] ?? 0;
        }
        return next;
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load festival till.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(getAuthUrl({ mode: "signin", next: "/festival" }));
      return;
    }
    if (!canUse) return;
    void load();
    const timer = window.setInterval(() => {
      fetchFestivalStatus()
        .then(setStatus)
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [authLoading, user, canUse, load, router]);

  const total = useMemo(() => {
    return products.reduce((sum, product) => {
      const qty = quantities[product.id] || 0;
      return sum + qty * Number(product.price);
    }, 0);
  }, [products, quantities]);

  const selectedItems = useMemo(
    () =>
      products
        .filter((p) => (quantities[p.id] || 0) > 0)
        .map((p) => ({ product_id: p.id, quantity: quantities[p.id] })),
    [products, quantities]
  );

  const printerBlocks =
    status?.mode === "cloudprnt" &&
    !status.can_accept_orders &&
    status.enabled;

  function setQty(productId: number, next: number) {
    const clamped = Math.max(0, Math.min(MAX_QTY, Math.floor(next) || 0));
    setQuantities((prev) => ({ ...prev, [productId]: clamped }));
    setLastOrderNumber(null);
  }

  async function handleSubmit() {
    if (submitting || selectedItems.length === 0 || printerBlocks) return;
    setSubmitting(true);
    try {
      const response = await placeFestivalOrder({
        client_request_id: clientRequestId,
        items: selectedItems,
      });
      setLastOrderNumber(response.order_number);
      toast.success(
        `Order #${response.order_number} placed — tickets queued for printing`
      );
      setQuantities(
        Object.fromEntries(products.map((p) => [p.id, 0])) as Record<number, number>
      );
      setClientRequestId(crypto.randomUUID());
      const refreshed = await fetchFestivalStatus().catch(() => null);
      if (refreshed) setStatus(refreshed);
    } catch (err) {
      const message =
        (err as Error & { response?: { data?: { detail?: string } } })?.response
          ?.data?.detail ||
        (err instanceof Error ? err.message : "Order failed");
      toast.error(message);
      // Keep basket and same UUID for retry
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10" style={{ color: "var(--muted-foreground)" }}>
        Loading…
      </div>
    );
  }

  if (!user) return null;

  if (!canUse) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-3" style={{ color: "var(--primary)" }}>
          Festival Orders
        </h1>
        <p style={{ color: "var(--muted-foreground)" }}>
          You do not have permission to use the festival till, or the feature is
          disabled.
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-[calc(100vh-4rem)] pb-28"
      style={{ background: "var(--background)" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1
              className="text-2xl md:text-3xl font-extrabold tracking-tight"
              style={{ color: "var(--primary)" }}
            >
              Festival Orders
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              Staff till — place paid orders instantly
            </p>
          </div>
          <PrinterBadge status={status} />
        </div>

        {lastOrderNumber && (
          <div
            className="mb-6 rounded-xl px-4 py-3 text-center"
            style={{
              background: "var(--success-bg)",
              border: "1px solid var(--success-border)",
              color: "var(--success-text)",
            }}
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-medium">Last ticket</p>
            <p className="text-4xl font-black tracking-tight">#{lastOrderNumber}</p>
          </div>
        )}

        {loadError && (
          <div
            className="mb-4 rounded-lg px-4 py-3"
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "var(--destructive)",
            }}
          >
            {loadError}{" "}
            <button className="underline font-medium" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-56 rounded-xl animate-pulse"
                style={{ background: "var(--card-bg)" }}
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div
            className="rounded-xl px-6 py-16 text-center"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--sidebar-border)",
            }}
          >
            <p className="font-semibold" style={{ color: "var(--foreground)" }}>
              No festival products yet
            </p>
            <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
              Add active products in Django admin to start taking orders.
            </p>
          </div>
        ) : (
          <ul
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
            aria-label="Festival products"
          >
            {products.map((product) => {
              const qty = quantities[product.id] || 0;
              return (
                <li
                  key={product.id}
                  className="flex flex-col rounded-xl overflow-hidden"
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--sidebar-border)",
                  }}
                >
                  <div
                    className="relative aspect-[4/3] w-full"
                    style={{ background: "var(--sidebar-bg)" }}
                  >
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width:768px) 50vw, 20vw"
                        unoptimized
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex items-center justify-center text-sm font-semibold px-2 text-center"
                        style={{ color: "var(--accent)" }}
                      >
                        Landar&apos;s Food
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div>
                      <h2
                        className="font-semibold text-sm leading-snug"
                        style={{ color: "var(--foreground)" }}
                      >
                        {product.name}
                      </h2>
                      <p
                        className="text-sm font-bold mt-1"
                        style={{ color: "var(--primary)" }}
                      >
                        {formatFestivalMoney(product.price)}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-1">
                      <button
                        type="button"
                        aria-label={`Decrease ${product.name}`}
                        className="flex items-center justify-center rounded-lg border text-lg font-bold"
                        style={{
                          minWidth: 48,
                          minHeight: 48,
                          borderColor: "var(--sidebar-border)",
                          color: "var(--foreground)",
                        }}
                        disabled={qty <= 0 || submitting}
                        onClick={() => setQty(product.id, qty - 1)}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_QTY}
                        aria-label={`Quantity for ${product.name}`}
                        className="w-14 text-center rounded-lg border text-base font-semibold"
                        style={{
                          minHeight: 48,
                          borderColor: "var(--sidebar-border)",
                          background: "var(--background)",
                          color: "var(--foreground)",
                        }}
                        value={qty}
                        disabled={submitting}
                        onChange={(e) => setQty(product.id, Number(e.target.value))}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${product.name}`}
                        className="flex items-center justify-center rounded-lg border text-lg font-bold"
                        style={{
                          minWidth: 48,
                          minHeight: 48,
                          borderColor: "var(--sidebar-border)",
                          color: "var(--foreground)",
                        }}
                        disabled={qty >= MAX_QTY || submitting}
                        onClick={() => setQty(product.id, qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        className="fixed bottom-0 inset-x-0 z-40 border-t px-4 py-3 backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--sidebar-bg) 92%, transparent)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Total (inc. VAT)
            </p>
            <p
              className="text-2xl font-black"
              style={{ color: "var(--primary)" }}
              aria-live="polite"
            >
              {formatFestivalMoney(total)}
            </p>
          </div>
          <Button
            size="xl"
            fullWidth
            className="sm:w-auto sm:min-w-[280px]"
            loading={submitting}
            disabled={
              submitting ||
              selectedItems.length === 0 ||
              Boolean(printerBlocks) ||
              !status?.enabled
            }
            onClick={() => void handleSubmit()}
            aria-label={`Place paid order for ${formatFestivalMoney(total)}`}
          >
            Place paid order — {formatFestivalMoney(total)}
          </Button>
        </div>
      </div>
    </div>
  );
}
