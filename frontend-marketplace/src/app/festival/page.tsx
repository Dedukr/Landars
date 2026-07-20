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

type ProductGroup = {
  key: string;
  label: string;
  products: FestivalProduct[];
};

type CartLine = {
  key: string;
  productId: number;
  additionId: number | null;
  productName: string;
  additionName: string;
  unitPrice: number;
  quantity: number;
};

function cartLineKey(productId: number, additionId: number | null): string {
  return `${productId}:${additionId ?? "none"}`;
}

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

function groupProductsByCategory(products: FestivalProduct[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  const uncategorised: FestivalProduct[] = [];

  for (const product of products) {
    if (product.category_id == null || !product.category) {
      uncategorised.push(product);
      continue;
    }
    const key = String(product.category_id);
    const existing = groups.get(key);
    if (existing) {
      existing.products.push(product);
    } else {
      groups.set(key, {
        key,
        label: product.category,
        products: [product],
      });
    }
  }

  const ordered = Array.from(groups.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
  if (uncategorised.length > 0) {
    ordered.push({
      key: "uncategorised",
      label: "Other",
      products: uncategorised,
    });
  }
  return ordered;
}

export default function FestivalTillPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<FestivalProduct[]>([]);
  const [status, setStatus] = useState<FestivalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID()
  );
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  const [activeProduct, setActiveProduct] = useState<FestivalProduct | null>(
    null
  );
  const [selectedAdditionId, setSelectedAdditionId] = useState<number | null>(
    null
  );
  const [quantity, setQuantity] = useState(1);

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

  const productGroups = useMemo(
    () => groupProductsByCategory(products),
    [products]
  );

  const printerBlocks =
    status?.mode === "cloudprnt" &&
    !status.can_accept_orders &&
    status.enabled;

  const selectedAddition = useMemo(() => {
    if (!activeProduct || selectedAdditionId == null) return null;
    return (
      activeProduct.additions.find((a) => a.id === selectedAdditionId) ?? null
    );
  }, [activeProduct, selectedAdditionId]);

  const unitTotal = useMemo(() => {
    if (!activeProduct) return 0;
    const additionPrice = selectedAddition
      ? Number(selectedAddition.price)
      : 0;
    return Number(activeProduct.price) + additionPrice;
  }, [activeProduct, selectedAddition]);

  const modalLineTotal = unitTotal * quantity;

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart]
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );

  const needsAddition = Boolean(activeProduct?.addition_class_id);

  const canAddToCart =
    Boolean(activeProduct) &&
    quantity >= 1 &&
    (!needsAddition || selectedAdditionId != null) &&
    !submitting;

  const canPlaceOrder =
    cart.length > 0 &&
    !printerBlocks &&
    Boolean(status?.enabled) &&
    !submitting;

  function openProductModal(product: FestivalProduct) {
    setActiveProduct(product);
    setQuantity(1);
    setSelectedAdditionId(
      product.additions.length === 1 ? product.additions[0].id : null
    );
    setLastOrderNumber(null);
  }

  function closeProductModal() {
    if (submitting) return;
    setActiveProduct(null);
    setSelectedAdditionId(null);
    setQuantity(1);
  }

  function setQty(next: number) {
    const clamped = Math.max(1, Math.min(MAX_QTY, Math.floor(next) || 1));
    setQuantity(clamped);
  }

  function handleAddToCart() {
    if (!activeProduct || !canAddToCart) return;
    const additionId = selectedAdditionId;
    const additionName = selectedAddition?.name ?? "";
    const key = cartLineKey(activeProduct.id, additionId);
    setCart((prev) => {
      const existing = prev.find((line) => line.key === key);
      if (existing) {
        const nextQty = Math.min(MAX_QTY, existing.quantity + quantity);
        return prev.map((line) =>
          line.key === key ? { ...line, quantity: nextQty } : line
        );
      }
      return [
        ...prev,
        {
          key,
          productId: activeProduct.id,
          additionId,
          productName: activeProduct.name,
          additionName,
          unitPrice: unitTotal,
          quantity,
        },
      ];
    });
    setLastOrderNumber(null);
    toast.success(`Added ${activeProduct.name}`);
    closeProductModal();
  }

  function removeCartLine(key: string) {
    setCart((prev) => prev.filter((line) => line.key !== key));
    setLastOrderNumber(null);
  }

  function clearCart() {
    setCart([]);
    setLastOrderNumber(null);
  }

  async function handlePlaceOrder() {
    if (!canPlaceOrder) return;
    setSubmitting(true);
    try {
      const items = cart.map((line) => {
        const item: {
          product_id: number;
          quantity: number;
          addition_id?: number;
        } = {
          product_id: line.productId,
          quantity: line.quantity,
        };
        if (line.additionId != null) {
          item.addition_id = line.additionId;
        }
        return item;
      });
      const response = await placeFestivalOrder({
        client_request_id: clientRequestId,
        items,
      });
      setLastOrderNumber(response.order_number);
      toast.success(
        status?.mode === "cloudprnt"
          ? `Order #${response.order_number} placed — tickets queued for printing`
          : `Order #${response.order_number} placed`
      );
      setCart([]);
      setClientRequestId(crypto.randomUUID());
      const refreshed = await fetchFestivalStatus().catch(() => null);
      if (refreshed) setStatus(refreshed);
    } catch (err) {
      const message =
        (err as Error & { response?: { data?: { detail?: string } } })?.response
          ?.data?.detail ||
        (err instanceof Error ? err.message : "Order failed");
      toast.error(message);
      // Keep cart and same UUID for retry
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
      className="relative pb-28 md:pb-32"
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

      <div className="mx-auto max-w-7xl px-4 pt-4 pb-6 md:px-6 md:pt-5 md:pb-8">
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

        {printerBlocks ? (
          <p
            className="mb-4 text-sm font-medium"
            style={{ color: "var(--destructive)" }}
            role="status"
          >
            Printer offline — orders paused
          </p>
        ) : !status?.enabled ? (
          <p
            className="mb-4 text-sm"
            style={{ color: "var(--muted-foreground)" }}
            role="status"
          >
            Festival ordering is disabled.
          </p>
        ) : null}

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
          <div className="flex flex-col gap-8">
            {productGroups.map((group, groupIndex) => (
              <section key={group.key} aria-labelledby={`category-${group.key}`}>
                {groupIndex > 0 && (
                  <hr
                    className="mb-6 border-0 border-t"
                    style={{ borderColor: "var(--sidebar-border)" }}
                  />
                )}
                <h2
                  id={`category-${group.key}`}
                  className="mb-3 text-lg md:text-xl font-bold tracking-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  {group.label}
                </h2>
                <ul
                  className="grid items-start gap-2 md:gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(6.75rem,1fr))]"
                  aria-label={`${group.label} products`}
                >
                  {group.products.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        className="flex h-fit w-full flex-col rounded-xl overflow-hidden shadow-sm text-left transition-transform active:scale-[0.98]"
                        style={{
                          background: "var(--card-bg)",
                          border: "1px solid var(--sidebar-border)",
                        }}
                        onClick={() => openProductModal(product)}
                        disabled={submitting}
                        aria-label={`Order ${product.name}`}
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
                          <h3
                            className="w-full font-semibold text-xs md:text-sm leading-snug text-left"
                            style={{ color: "var(--foreground)" }}
                          >
                            {product.name}
                          </h3>
                          <p
                            className="w-full text-xs md:text-sm font-bold text-right tabular-nums"
                            style={{ color: "var(--primary)" }}
                          >
                            {formatFestivalMoney(product.price)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <div
        className="fixed bottom-0 inset-x-0 z-40 border-t px-3 py-2 md:px-4 md:py-3 backdrop-blur-md"
        style={{
          background: "color-mix(in srgb, var(--sidebar-bg) 92%, transparent)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div className="mx-auto max-w-7xl flex flex-col gap-2">
          {cart.length > 0 && (
            <ul
              className="max-h-28 overflow-y-auto flex flex-col gap-1"
              aria-label="Festival cart"
            >
              {cart.map((line) => (
                <li
                  key={line.key}
                  className="flex items-center justify-between gap-2 text-sm"
                  style={{ color: "var(--foreground)" }}
                >
                  <span className="min-w-0 truncate">
                    {line.quantity}× {line.productName}
                    {line.additionName ? ` + ${line.additionName}` : ""}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums font-semibold">
                      {formatFestivalMoney(line.unitPrice * line.quantity)}
                    </span>
                    <button
                      type="button"
                      className="rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{ color: "var(--destructive)" }}
                      aria-label={`Remove ${line.productName}`}
                      onClick={() => removeCartLine(line.key)}
                      disabled={submitting}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-row items-center gap-2 md:gap-3 justify-between">
            <div className="min-w-0 shrink">
              <p
                className="text-xs md:text-sm leading-tight"
                style={{ color: "var(--muted-foreground)" }}
              >
                Cart{cartItemCount > 0 ? ` · ${cartItemCount}` : ""} (inc. VAT)
              </p>
              <p
                className="text-lg md:text-2xl font-black leading-tight tabular-nums"
                style={{ color: "var(--primary)" }}
                aria-live="polite"
              >
                {formatFestivalMoney(cartTotal)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {cart.length > 0 && (
                <button
                  type="button"
                  className="text-sm font-medium underline-offset-2 hover:underline"
                  style={{ color: "var(--muted-foreground)" }}
                  onClick={clearCart}
                  disabled={submitting}
                >
                  Clear
                </button>
              )}
              <Button
                size="lg"
                className="!min-h-11 md:!min-h-12 !px-4 md:!px-6 !py-2 md:!py-3 text-sm md:text-base sm:min-w-[200px]"
                loading={submitting}
                disabled={!canPlaceOrder}
                onClick={() => void handlePlaceOrder()}
                aria-label={`Place order for ${formatFestivalMoney(cartTotal)}`}
                title={
                  printerBlocks
                    ? "Printer offline — orders cannot be placed"
                    : !status?.enabled
                      ? "Festival ordering is disabled"
                      : cart.length === 0
                        ? "Add items to place an order"
                        : undefined
                }
              >
                Place order
              </Button>
            </div>
          </div>
        </div>
      </div>

      {activeProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="festival-order-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close"
            onClick={closeProductModal}
            disabled={submitting}
          />
          <div
            className="relative z-10 flex w-full max-w-md max-h-[92dvh] flex-col rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--sidebar-border)",
            }}
          >
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
              <div className="min-w-0">
                <h2
                  id="festival-order-modal-title"
                  className="text-xl font-bold leading-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  {activeProduct.name}
                </h2>
                <p
                  className="mt-1 text-sm tabular-nums"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  From {formatFestivalMoney(activeProduct.price)}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium"
                style={{ color: "var(--muted-foreground)" }}
                onClick={closeProductModal}
                disabled={submitting}
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-3">
              {needsAddition && (
                <fieldset className="mb-4">
                  <legend
                    className="mb-2 text-sm font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    Choose addition
                    {activeProduct.addition_class
                      ? ` (${activeProduct.addition_class})`
                      : ""}
                  </legend>
                  {activeProduct.additions.length === 0 ? (
                    <p
                      className="text-sm"
                      style={{ color: "var(--destructive)" }}
                    >
                      No additions configured for this class.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {activeProduct.additions.map((addition) => {
                        const selected = selectedAdditionId === addition.id;
                        return (
                          <li key={addition.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left"
                              style={{
                                background: selected
                                  ? "color-mix(in srgb, var(--primary) 12%, var(--background))"
                                  : "var(--background)",
                                border: selected
                                  ? "2px solid var(--primary)"
                                  : "1px solid var(--sidebar-border)",
                                color: "var(--foreground)",
                              }}
                              aria-pressed={selected}
                              onClick={() => setSelectedAdditionId(addition.id)}
                              disabled={submitting}
                            >
                              <span className="font-medium">{addition.name}</span>
                              <span className="tabular-nums font-semibold">
                                {formatFestivalMoney(addition.price)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </fieldset>
              )}

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  className="flex items-center justify-center rounded-lg border text-xl font-bold min-w-12 min-h-12"
                  style={{
                    borderColor: "var(--sidebar-border)",
                    color: "var(--foreground)",
                  }}
                  disabled={quantity <= 1 || submitting}
                  onClick={() => setQty(quantity - 1)}
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QTY}
                  aria-label={`Quantity for ${activeProduct.name}`}
                  className="w-16 text-center rounded-lg border text-lg font-semibold min-h-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{
                    borderColor: "var(--sidebar-border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                  }}
                  value={quantity}
                  disabled={submitting}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  className="flex items-center justify-center rounded-lg border text-xl font-bold min-w-12 min-h-12"
                  style={{
                    borderColor: "var(--sidebar-border)",
                    color: "var(--foreground)",
                  }}
                  disabled={quantity >= MAX_QTY || submitting}
                  onClick={() => setQty(quantity + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div
              className="border-t px-4 py-3 flex flex-col gap-2"
              style={{ borderColor: "var(--sidebar-border)" }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Line total
                </span>
                <span
                  className="text-2xl font-black tabular-nums"
                  style={{ color: "var(--primary)" }}
                  aria-live="polite"
                >
                  {formatFestivalMoney(modalLineTotal)}
                </span>
              </div>
              <Button
                size="lg"
                className="w-full !min-h-12 text-base"
                disabled={!canAddToCart}
                onClick={handleAddToCart}
                aria-label={`Add to cart for ${formatFestivalMoney(modalLineTotal)}`}
                title={
                  needsAddition && selectedAdditionId == null
                    ? "Choose an addition"
                    : undefined
                }
              >
                Add to cart
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
