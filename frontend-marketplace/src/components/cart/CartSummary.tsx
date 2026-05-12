"use client";
import React, { memo } from "react";
import Link from "next/link";
import SubtotalDisplay from "./SubtotalDisplay";
import TotalDisplay from "./TotalDisplay";
import DiscountDisplay from "./DiscountDisplay";
import {
  ClipboardList,
  Truck,
  Package,
  ChevronRight,
  Info,
  AlertTriangle,
} from "lucide-react";

interface DeliveryCalculation {
  isHomeDelivery: boolean;
  totalWeight: number;
  hasSausages: boolean;
  overweight?: boolean;
}

interface CartSummaryProps {
  subtotal: number;
  discount: number;
  total: number;
  totalItems: number;
  deliveryCalculation: DeliveryCalculation;
  onClearCart: () => void;
}

const CartSummary = memo<CartSummaryProps>(
  ({
    subtotal,
    discount,
    total,
    totalItems,
    deliveryCalculation,
    onClearCart,
  }) => {
    const isDeliveryHome = deliveryCalculation.isHomeDelivery;
    const hasSausages = deliveryCalculation.hasSausages;
    const spendMoreForFreePost =
      hasSausages &&
      !isDeliveryHome &&
      !deliveryCalculation.overweight &&
      subtotal < 220
        ? (220 - subtotal).toFixed(2)
        : null;

    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--sidebar-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-5 py-4"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <ClipboardList
            className="w-4 h-4 shrink-0"
            style={{ color: "var(--accent)" }}
            aria-hidden="true"
          />
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            Order summary
          </h2>
        </div>

        <div className="p-5 space-y-4">
          {/* Delivery type badge */}
          <div
            className="flex items-start gap-3 p-3 rounded-xl"
            style={{
              background: "var(--info-bg)",
              border: "1px solid var(--info-border)",
            }}
          >
            <div className="shrink-0 mt-0.5">
              {isDeliveryHome ? (
                <Truck
                  className="w-4 h-4"
                  style={{ color: "var(--info-text)" }}
                  aria-hidden="true"
                />
              ) : (
                <Package
                  className="w-4 h-4"
                  style={{ color: "var(--info-text)" }}
                  aria-hidden="true"
                />
              )}
            </div>
            <div>
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--info-text)" }}
              >
                {isDeliveryHome ? "Home delivery" : "Post delivery"}
              </p>
              <p
                className="text-xs mt-0.5 leading-relaxed"
                style={{ color: "var(--info-text)", opacity: 0.85 }}
              >
                {isDeliveryHome
                  ? "This order will be delivered directly to your address."
                  : "This order is suitable for Royal Mail post delivery."}
              </p>
              {deliveryCalculation.totalWeight > 0 && (
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--info-text)", opacity: 0.75 }}
                >
                  Est. parcel weight: {deliveryCalculation.totalWeight.toFixed(1)}kg
                </p>
              )}
            </div>
          </div>

          {/* Free post threshold nudge */}
          {spendMoreForFreePost && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl"
              style={{
                background: "var(--success-bg)",
                border: "1px solid var(--success-border)",
              }}
            >
              <Info
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: "var(--success-text)" }}
                aria-hidden="true"
              />
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--success-text)" }}
              >
                Spend{" "}
                <span className="font-semibold">£{spendMoreForFreePost}</span>{" "}
                more to qualify for free post delivery on sausages (orders over
                £220).
              </p>
            </div>
          )}

          {/* Perishable notice */}
          {hasSausages && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl"
              style={{
                background: "var(--info-bg)",
                border: "1px solid var(--info-border)",
              }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: "var(--info-text)" }}
                aria-hidden="true"
              />
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--info-text)", opacity: 0.85 }}
              >
                This order contains chilled sausages and marinated products.
                Please ensure someone is available to receive delivery promptly.
              </p>
            </div>
          )}

          {/* Price breakdown */}
          <div className="space-y-2.5">
            <SubtotalDisplay subtotal={subtotal} />
            <DiscountDisplay discount={discount} />
            <TotalDisplay total={total} />
          </div>

          {/* Delivery fee note */}
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--muted-foreground)" }}
          >
            Delivery fee is calculated at checkout based on your location and
            order contents.
          </p>

          {/* Separator */}
          <div style={{ borderTop: "1px solid var(--sidebar-border)" }} />

          {/* Actions */}
          <div className="space-y-2.5">
            {/* Primary: proceed to checkout */}
            <Link
              href="/checkout"
              className="flex items-center justify-center gap-2 w-full py-3 px-5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
              style={{ background: "var(--primary)", color: "white" }}
              aria-label={`Review order — ${totalItems} ${totalItems === 1 ? "item" : "items"}`}
            >
              Review order
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Link>

            {/* Secondary: continue shopping */}
            <Link
              href="/shop"
              className="flex items-center justify-center w-full py-2.5 px-5 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
              style={{
                border: "1px solid var(--sidebar-border)",
                color: "var(--foreground)",
              }}
            >
              Continue shopping
            </Link>

            {/* Destructive: clear cart */}
            <button
              onClick={onClearCart}
              className="w-full py-2.5 px-5 rounded-xl text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--destructive)" }}
              aria-label="Clear all items from your basket"
            >
              Clear basket
            </button>
          </div>

          {/* Trust strip */}
          <div
            className="flex items-center gap-2 pt-1"
            style={{ borderTop: "1px solid var(--sidebar-border)" }}
          >
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--muted-foreground)" }}
            >
              Review your items before sending your order request. You can
              adjust quantities before submitting.
            </p>
          </div>
        </div>
      </div>
    );
  }
);

CartSummary.displayName = "CartSummary";
export default CartSummary;
