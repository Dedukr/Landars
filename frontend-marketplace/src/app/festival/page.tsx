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
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID()
  );
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canUse = Boolean(user?.can_use_festival);

  useEffect(() => {
    document.documentElement.classList.add("festival-till-active");
    return () => {
      document.documentElement.classList.remove("festival-till-active");
    };
  }, []);

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
        status?.mode === "cloudprnt"
          ? `Order #${response.order_number} placed — tickets queued for printing`
          : `Order #${response.order_number} placed`
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
      className="relative pb-16 md:pb-[4.5rem]"
      style={{ background: "var(--background)" }}
    >
      {lastOrderNumber && (
        <div
          className="absolute left-0 right-0 top-0 z-50 flex justify-center px-4 pt-3 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div
            className="pointer-events-auto w-full max-w-md rounded-2xl px-5 py-4 text-center shadow-lg"
            style={{
              background: "var(--success-bg)",
              border: "1px solid var(--success-border)",
              color: "var(--success-text)",
            }}
          >
            <p className="text-sm font-medium">Last ticket</p>
            <p className="text-4xl font-black tracking-tight">#{lastOrderNumber}</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 pt-4 pb-2 md:px-6 md:pt-5 md:pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1
              className="text-2xl md:text-3xl font-extrabold tracking-tight"
              style={{ color: "var(--primary)" }}
            >
              Festival Orders
            </h1>
          </div>
          <PrinterBadge status={status} />
        </div>

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
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-56 md:h-80 rounded-2xl animate-pulse"
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
            className="grid items-start gap-2 md:gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(6.75rem,1fr))]"
            aria-label="Festival products"
          >
            {products.map((product) => {
              const qty = quantities[product.id] || 0;
              return (
                <li
                  key={product.id}
                  className="flex h-fit w-full flex-col rounded-xl overflow-hidden shadow-sm"
                  style={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--sidebar-border)",
                  }}
                >
                  <div
                    className="relative aspect-[3/2] md:aspect-[5/4] w-full shrink-0"
                    style={{ background: "var(--sidebar-bg)" }}
                  >
                    {product.image && !brokenImages[product.id] ? (
                      <Image
                        src={product.image}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="108px"
                        unoptimized
                        onError={() =>
                          setBrokenImages((prev) => ({
                            ...prev,
                            [product.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex items-center justify-center text-xs md:text-sm font-semibold px-1.5 md:px-2 text-center leading-snug"
                        style={{ color: "var(--accent)" }}
                      >
                        {product.name}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 md:gap-1 p-1.5 md:p-2.5">
                    <h2
                      className="w-full font-semibold text-xs md:text-sm leading-snug text-left"
                      style={{ color: "var(--foreground)" }}
                    >
                      {product.name}
                    </h2>
                    <p
                      className="w-full text-xs md:text-sm font-bold text-right tabular-nums"
                      style={{ color: "var(--primary)" }}
                    >
                      {formatFestivalMoney(product.price)}
                    </p>
                    <div className="mt-1 flex items-center justify-center gap-0.5 md:gap-1">
                      <button
                        type="button"
                        aria-label={`Decrease ${product.name}`}
                        className="flex items-center justify-center rounded-md md:rounded-lg border text-base md:text-lg font-bold flex-1 basis-0 !min-w-0 max-w-12 !min-h-8 md:!min-h-9"
                        style={{
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
                        className="flex-1 basis-0 min-w-0 max-w-12 text-center rounded-md md:rounded-lg border text-base font-semibold min-h-8 md:min-h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={{
                          borderColor: "var(--sidebar-border)",
                          background: "var(--background)",
                          color: "var(--foreground)",
                        }}
                        value={qty}
                        disabled={submitting}
                        onFocus={(e) => e.currentTarget.select()}
                        onClick={(e) => e.currentTarget.select()}
                        onChange={(e) => setQty(product.id, Number(e.target.value))}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${product.name}`}
                        className="flex items-center justify-center rounded-md md:rounded-lg border text-base md:text-lg font-bold flex-1 basis-0 !min-w-0 max-w-12 !min-h-8 md:!min-h-9"
                        style={{
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
        className="fixed bottom-0 inset-x-0 z-40 border-t px-3 py-2 md:px-4 md:py-3 backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--sidebar-bg) 92%, transparent)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="mx-auto max-w-7xl flex flex-row items-center gap-2 md:gap-3 justify-between">
          <div className="min-w-0 shrink">
            <p className="text-xs md:text-sm leading-tight" style={{ color: "var(--muted-foreground)" }}>
              Total (inc. VAT)
            </p>
            <p
              className="text-lg md:text-2xl font-black leading-tight tabular-nums"
              style={{ color: "var(--primary)" }}
              aria-live="polite"
            >
              {formatFestivalMoney(total)}
            </p>
            {printerBlocks ? (
              <p
                className="mt-0.5 text-xs md:text-sm font-medium leading-tight"
                style={{ color: "var(--destructive)" }}
                role="status"
              >
                Printer offline — orders paused
              </p>
            ) : !status?.enabled ? (
              <p
                className="mt-0.5 text-xs md:text-sm leading-tight"
                style={{ color: "var(--muted-foreground)" }}
                role="status"
              >
                Festival ordering is disabled.
              </p>
            ) : null}
          </div>
          <Button
            size="lg"
            className="shrink-0 !min-h-11 md:!min-h-12 !px-4 md:!px-6 !py-2 md:!py-3 text-sm md:text-base sm:min-w-[240px]"
            loading={submitting}
            disabled={
              submitting ||
              selectedItems.length === 0 ||
              Boolean(printerBlocks) ||
              !status?.enabled
            }
            onClick={() => void handleSubmit()}
            aria-label={`Place order for ${formatFestivalMoney(total)}`}
            title={
              printerBlocks
                ? "Printer offline — orders cannot be placed"
                : !status?.enabled
                  ? "Festival ordering is disabled"
                  : selectedItems.length === 0
                    ? "Add items to place an order"
                    : undefined
            }
          >
            Place order
          </Button>
        </div>
      </div>
    </div>
  );
}
