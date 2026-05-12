"use client";

import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface MobileProductActionBarProps {
  priceDisplay: string | null;
  quantity: number;
  cartQuantity: number;
  isAvailable: boolean;
  onQuantityChange: (n: number) => void;
  onAddToCart: () => void;
  /** Clears this product from the basket (mobile parity with desktop). */
  onRemoveFromBasket?: () => void;
}

export default function MobileProductActionBar({
  priceDisplay,
  quantity,
  cartQuantity,
  isAvailable,
  onQuantityChange,
  onAddToCart,
  onRemoveFromBasket,
}: MobileProductActionBarProps) {
  return (
    <div
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex flex-col"
      style={{
        background: "var(--card-bg)",
        borderTop: "1px solid var(--sidebar-border)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      role="region"
      aria-label="Basket and add to order"
    >
      {cartQuantity > 0 && onRemoveFromBasket && (
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{
            borderColor: "var(--sidebar-border)",
            background: "var(--sidebar-bg)",
          }}
        >
          <p className="text-sm font-medium tabular-nums" style={{ color: "var(--foreground)" }}>
            {cartQuantity} in your basket
          </p>
          <button
            type="button"
            onClick={onRemoveFromBasket}
            className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-semibold underline-offset-2 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            style={{ color: "var(--destructive)" }}
          >
            Remove
          </button>
        </div>
      )}

      <div className="px-4 py-3 flex items-center gap-3">
        {priceDisplay && (
          <div className="flex-shrink-0 min-w-0">
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted-foreground)" }}
            >
              Price
            </p>
            <p
              className="text-xl font-bold tabular-nums leading-tight"
              style={{ color: "var(--accent)" }}
            >
              {priceDisplay}
            </p>
          </div>
        )}

        {isAvailable && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onQuantityChange(quantity - 1)}
              disabled={quantity <= 1}
              className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center font-bold text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{
                border: "1px solid var(--sidebar-border)",
                background: "var(--sidebar-bg)",
                color: "var(--foreground)",
              }}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span
              className="min-w-[1.75rem] text-center font-semibold text-sm tabular-nums"
              style={{ color: "var(--foreground)" }}
            >
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => onQuantityChange(quantity + 1)}
              disabled={quantity >= 99}
              className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center font-bold text-lg leading-none disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{
                border: "1px solid var(--sidebar-border)",
                background: "var(--sidebar-bg)",
                color: "var(--foreground)",
              }}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <Button
            variant="primary"
            size="md"
            fullWidth
            disabled={!isAvailable}
            onClick={onAddToCart}
            icon={<ShoppingBag className="w-4 h-4" aria-hidden />}
          >
            {cartQuantity > 0
              ? `Add more to basket`
              : isAvailable
                ? "Add to basket"
                : "Unavailable"}
          </Button>
        </div>
      </div>
    </div>
  );
}
