"use client";
import React, { memo } from "react";
import Link from "next/link";
import SubtotalDisplay from "./SubtotalDisplay";
import TotalDisplay from "./TotalDisplay";
import DiscountDisplay from "./DiscountDisplay";
import DeliveryFeeDisplay from "./DeliveryFeeDisplay";
import {
  ClipboardList,
  Truck,
  Package,
  ChevronRight,
  Info,
  AlertTriangle,
} from "lucide-react";
import type { DeliveryFeeCalculation } from "@/utils/deliveryFeeCalculator";
import {
  FREE_HOME_DELIVERY_THRESHOLD,
  HOME_DELIVERY_FEE,
} from "@/utils/deliveryFeeCalculator";

interface CartSummaryProps {
  subtotal: number;
  discount: number;
  total: number;
  totalItems: number;
  deliveryCalculation: DeliveryFeeCalculation;
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
    const {
      allPostDelivery,
      qualifiesForFreeHomeDelivery,
      deliveryFee,
      dependsOnCourier,
      overweight,
      totalWeight,
      reasoning,
    } = deliveryCalculation;

    const amountToFreeHomeDelivery =
      FREE_HOME_DELIVERY_THRESHOLD - subtotal;

    const spendMoreForFreeDelivery =
      !allPostDelivery &&
      !qualifiesForFreeHomeDelivery &&
      amountToFreeHomeDelivery > 0
        ? amountToFreeHomeDelivery.toFixed(2)
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
          {allPostDelivery ? (
            <>
              {/* Post delivery info — only when every item qualifies */}
              <div
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{
                  background: "var(--info-bg)",
                  border: "1px solid var(--info-border)",
                }}
              >
                <Package
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: "var(--info-text)" }}
                  aria-hidden="true"
                />
                <div>
                  <p
                    className="text-xs font-semibold"
                    style={{ color: "var(--info-text)" }}
                  >
                    Post delivery
                  </p>
                  <p
                    className="text-xs mt-0.5 leading-relaxed"
                    style={{ color: "var(--info-text)", opacity: 0.85 }}
                  >
                    All items in your basket are suitable for Royal Mail post
                    delivery.
                  </p>
                  {totalWeight > 0 && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--info-text)", opacity: 0.75 }}
                    >
                      Est. parcel weight: {totalWeight.toFixed(1)}kg
                    </p>
                  )}
                </div>
              </div>

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
            </>
          ) : (
            <>
              <div
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{
                  background: "var(--info-bg)",
                  border: "1px solid var(--info-border)",
                }}
              >
                <Truck
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: "var(--info-text)" }}
                  aria-hidden="true"
                />
                <div>
                  <p
                    className="text-xs font-semibold"
                    style={{ color: "var(--info-text)" }}
                  >
                    Home delivery
                  </p>
                  <p
                    className="text-xs mt-0.5 leading-relaxed whitespace-pre-line"
                    style={{ color: "var(--info-text)", opacity: 0.85 }}
                  >
                    A £{HOME_DELIVERY_FEE} delivery fee applies.{"\n"}Free delivery
                    is available on orders of £{FREE_HOME_DELIVERY_THRESHOLD} or more.
                  </p>
                </div>
              </div>

              {spendMoreForFreeDelivery ? (
                <div
                  className="flex items-start gap-2.5 p-3 rounded-xl"
                  style={{
                    background: "var(--info-bg)",
                    border: "1px solid var(--info-border)",
                  }}
                >
                  <Info
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: "var(--info-text)" }}
                    aria-hidden="true"
                  />
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--info-text)" }}
                  >
                    Spend{" "}
                    <span className="font-semibold">£{spendMoreForFreeDelivery}</span>{" "}
                    more for free delivery (orders of £
                    {FREE_HOME_DELIVERY_THRESHOLD} or more).
                  </p>
                </div>
              ) : null}
            </>
          )}

          {/* Price breakdown */}
          <div className="space-y-2.5">
            <SubtotalDisplay subtotal={subtotal} />
            <DiscountDisplay discount={discount} />
            <DeliveryFeeDisplay
              deliveryFee={deliveryFee}
              isFree={!allPostDelivery && qualifiesForFreeHomeDelivery}
              highlightFree={!allPostDelivery && qualifiesForFreeHomeDelivery}
              dependsOnCourier={allPostDelivery && dependsOnCourier}
              overweight={overweight}
              reasoning={reasoning}
              hasSausages={allPostDelivery}
              weight={totalWeight}
            />
            <TotalDisplay total={total} />
          </div>

          {allPostDelivery && dependsOnCourier && !overweight ? (
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--muted-foreground)" }}
            >
              Post delivery cost is confirmed at checkout from live courier rates.
            </p>
          ) : null}

          {/* Separator */}
          <div style={{ borderTop: "1px solid var(--sidebar-border)" }} />

          {/* Actions */}
          <div className="space-y-2.5">
            <Link
              href="/checkout"
              className="flex items-center justify-center gap-2 w-full py-3 px-5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
              style={{ background: "var(--btn-primary)", color: "white" }}
              aria-label={`Review order — ${totalItems} ${totalItems === 1 ? "item" : "items"}`}
            >
              Review order
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Link>

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
